import { Effect, Option } from "effect";
import { isAddressEqual } from "viem";
import type { Abi, Address } from "viem";
import { Clients, type DeployResult } from "../services/clients";
import { Store } from "../services/store";
import { DeploymentChainMismatch, DeploymentExists, DeploymentFailed } from "../errors";
import type { InvalidDeploymentRecord, LibrariesUnlinked, PluginFailed } from "../errors";
import { linkLibraries } from "./link-libraries";
import { resolveActive, runOnContractDeployed, runOnDeployFailed, type OnPluginError } from "./plugins";
import type { AnyDeployPlugin, PluginDeps } from "../plugin";
import type {
  DeploymentHistoryEntry,
  DeploymentRecord,
  Libraries,
  RedeployReason,
  TypedArtifact,
} from "../schemas";
import { networkKeyForChain } from "../store";
import { computeIdentity, type Identity } from "./identity";
import { diffIdentity, renderSummary } from "./reasons";
import { pinSources } from "./sources";
import type { RedeploymentStrategy } from "../config";

export interface GetOrDeployOptions {
  readonly args: readonly unknown[];
  readonly deploymentName?: string;
  readonly redeploymentStrategy?: RedeploymentStrategy;
  readonly libraries?: Libraries;
  readonly plugins?: Readonly<Record<string, unknown>>;
  readonly onPluginError?: OnPluginError;
}

const jsonKey = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? inner.toString() : inner));

/**
 * Under `never` we still reuse, but surface drift so a stale record doesn't pass silently.
 * External records carry no meaningful bytecode/args, so they're exempt.
 */
const warnIfStale = (
  existing: DeploymentRecord,
  artifact: TypedArtifact,
  args: readonly unknown[],
  deps: PluginDeps,
): void => {
  if (existing.kind !== "external" && existing.bytecode !== artifact.bytecode) {
    deps.log.warn(
      `[deployoor] Reusing ${existing.deploymentName} at ${existing.address}, but the current artifact bytecode differs. Set redeploymentStrategy 'on-change' (the default) or 'always' to redeploy.`,
    );
  }
  if (jsonKey(existing.constructorArgs) !== jsonKey([...args])) {
    deps.log.warn(
      `[deployoor] Reusing ${existing.deploymentName} at ${existing.address}, but constructor args differ from the recorded deployment. Set redeploymentStrategy 'on-change' (the default) or 'always' to redeploy.`,
    );
  }
};

// `on-change` reuse test: prefer the canonical stored identityHash (v2 records) when the current
// identity is computable; otherwise fall back to the component diff (also the v1-record path).
const identityChanged = (
  existing: DeploymentRecord,
  current: Option.Option<Identity>,
  artifact: TypedArtifact,
  args: readonly unknown[],
  libraries: Libraries,
): boolean => {
  if (existing.identityHash !== undefined && Option.isSome(current)) {
    return current.value.identityHash !== existing.identityHash;
  }
  return (
    diffIdentity({
      existing,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
      args,
      libraries,
    }).length > 0
  );
};

/**
 * The deploy pipeline, read top-to-bottom. A recorded deployment is reused (no transaction)
 * unless the resolved `redeploymentStrategy` says otherwise: `always` redeploys, `on-change`
 * redeploys iff the deploy identity moved, `never` reuses and warns on drift. Every real
 * (re)deploy appends a reasoned history entry and pins its verification sources.
 */
export const getOrDeploy = <A extends Abi>(
  artifact: TypedArtifact<A>,
  opts: GetOrDeployOptions,
  plugins: ReadonlyArray<AnyDeployPlugin>,
  deps: PluginDeps,
  strategyForChain: (chainId: number) => RedeploymentStrategy,
): Effect.Effect<
  DeployResult<A>,
  DeploymentChainMismatch | DeploymentFailed | LibrariesUnlinked | InvalidDeploymentRecord | PluginFailed,
  Clients | Store
> =>
  Effect.gen(function* () {
    const clients = yield* Clients;
    const store = yield* Store;
    const network = networkKeyForChain(clients.chain);
    const name = opts.deploymentName ?? artifact.name;
    const active = resolveActive(plugins, opts.plugins);
    const onError = opts.onPluginError ?? "warn";
    const libraries = opts.libraries ?? {};
    const strategy = strategyForChain(clients.chain.id);

    const release = yield* store.lock(network, name);
    const runLocked = Effect.gen(function* () {
      const existing = Option.getOrUndefined(yield* store.read(network, name));

      // Don't reuse a record recorded for a different chain. Skipped by `always` (which overwrites)
      // and by external records (already chain-scoped by the network key).
      if (
        existing !== undefined &&
        existing.kind !== "external" &&
        strategy !== "always" &&
        existing.chainId !== clients.chain.id
      ) {
        return yield* Effect.fail(
          new DeploymentChainMismatch({
            deploymentName: name,
            expectedChainId: clients.chain.id,
            actualChainId: existing.chainId,
          }),
        );
      }

      // Computed once from live args; drives the on-change decision (when the record has an
      // identityHash) and is stored on the new record. `Effect.option` because encoding
      // structurally-invalid args throws — that path just falls back to the component diff and,
      // ultimately, a clean DeploymentFailed from the deploy itself.
      const currentIdentity = yield* Effect.try(() =>
        computeIdentity({
          abi: artifact.abi,
          deployedBytecode: artifact.deployedBytecode,
          args: opts.args,
          libraries,
        }),
      ).pipe(Effect.option);

      const reuse =
        existing !== undefined &&
        (existing.kind === "external" ||
          strategy === "never" ||
          (strategy === "on-change" &&
            !identityChanged(existing, currentIdentity, artifact, opts.args, libraries)));

      if (existing !== undefined && reuse) {
        if (strategy === "never") warnIfStale(existing, artifact, opts.args, deps);
        yield* runOnContractDeployed(
          active,
          { deployment: existing, reused: true, metadata: artifact.metadata },
          deps,
          onError,
        );
        return {
          contract: clients.contractAt(existing.address, artifact.abi),
          deployment: existing,
          freshDeploy: false,
        };
      }

      const reason: RedeployReason =
        existing === undefined
          ? { kind: "fresh" }
          : strategy === "always"
            ? { kind: "forced" }
            : {
                kind: "changed",
                changes: diffIdentity({
                  existing,
                  abi: artifact.abi,
                  bytecode: artifact.bytecode,
                  deployedBytecode: artifact.deployedBytecode,
                  args: opts.args,
                  libraries,
                }),
              };

      const bytecode = yield* linkLibraries(artifact, opts.libraries);
      const hash = yield* Effect.tryPromise({
        try: () => clients.deploy({ abi: artifact.abi, bytecode, args: opts.args }),
        catch: (cause) => new DeploymentFailed({ contract: name, cause }),
      });
      const receipt = yield* Effect.tryPromise({
        try: () => clients.waitForReceipt(hash),
        catch: (cause) => new DeploymentFailed({ contract: name, cause }),
      });
      const address = receipt.contractAddress;
      if (address === null || address === undefined) {
        return yield* Effect.fail(
          new DeploymentFailed({ contract: name, cause: "receipt has no contractAddress" }),
        );
      }

      const now = deps.now();
      // Omitted rather than substituted when the identity is not computable: the field means one
      // specific thing, and storing a bare code hash under it would never match a real identity
      // hash — buying exactly one spurious redeploy. Absent, `identityChanged` falls back to the
      // component diff, which is the honest answer.
      const identity = Option.getOrUndefined(currentIdentity);
      const identityHash = identity?.identityHash;
      const contractCodeHash = identity?.codeHash;
      // Pin the verification input BEFORE writing the record, so a record's `sourcesHash` never
      // points at a blob that does not exist. Best-effort by design: the deploy is already
      // broadcast and confirmed, so a store that cannot pin sources must not turn a successful
      // deployment into a rejected promise (which would also skip the plugins below). Pinning is
      // optional in the `StoreAdapter` contract — a store may implement no source methods at all.
      const sources = pinSources(artifact.metadata);
      const pinned = yield* store.writeSources(sources.hash, sources.sidecar).pipe(
        Effect.as(true),
        Effect.catchAll((cause) =>
          Effect.sync(() => {
            deps.log.warn(
              `[deployoor] Deployed ${name}, but could not pin its verification sources (${cause}). The record is written without a sourcesHash.`,
            );
            return false;
          }),
        ),
      );
      const summary = renderSummary(reason, artifact.abi);
      const entry: DeploymentHistoryEntry = {
        at: now,
        address,
        transactionHash: hash,
        deployer: clients.account,
        ...(identityHash === undefined ? {} : { identityHash }),
        reason,
        summary,
        ...(existing === undefined ? {} : { supersededAddress: existing.address }),
      };
      // Merge the compile-time artifact (abi, bytecode, compiler metadata) with the runtime
      // deploy result (address, tx, deployer, chain, args) plus the identity + reasoned history.
      const record: DeploymentRecord = {
        schemaVersion: 2,
        contractName: artifact.name,
        deploymentName: name,
        address,
        chainId: clients.chain.id,
        networkName: network,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        constructorArgs: [...opts.args],
        transactionHash: hash,
        deployer: clients.account,
        deployedAt: now,
        compiler: {
          version: artifact.metadata.compilerVersion,
          settings: artifact.metadata.standardJsonInput.settings,
        },
        ...(contractCodeHash === undefined ? {} : { codeHash: contractCodeHash }),
        ...(identityHash === undefined ? {} : { identityHash }),
        ...(pinned ? { sourcesHash: sources.hash } : {}),
        // Record the linked libraries so a library-dependent deployment round-trips
        // (the stored bytecode keeps solc's placeholders; the addresses live here).
        ...(opts.libraries === undefined ? {} : { libraries: opts.libraries }),
        history: [...(existing?.history ?? []), entry],
        kind: "standard",
      };
      yield* store.write(record);
      deps.log.info(
        `[deployoor] Deployed ${name} on ${network} at ${address} — ${summary}${existing === undefined ? "" : ` (superseded ${existing.address})`}`,
      );
      yield* runOnContractDeployed(
        active,
        { deployment: record, reused: false, receipt, metadata: artifact.metadata },
        deps,
        onError,
      );
      return {
        contract: clients.contractAt(address, artifact.abi),
        deployment: record,
        freshDeploy: true,
        receipt,
      };
    }).pipe(
      Effect.catchTag("DeploymentFailed", (error) =>
        runOnDeployFailed(
          active,
          {
            contractName: artifact.name,
            deploymentName: name,
            chainId: clients.chain.id,
            networkName: network,
            cause: error.cause,
          },
          deps,
        ).pipe(Effect.zipRight(Effect.fail(error))),
      ),
      Effect.ensuring(release()),
    );

    return yield* runLocked;
  });

export interface RegisterEntry<A extends Abi = Abi> {
  readonly name: string;
  readonly address: Address;
  readonly abi: A;
}

/**
 * Record a contract you did not deploy (e.g. USDC) on the deployer's chain, marked
 * `kind: "external"` so it's distinguishable from a real deployment. Won't clobber a
 * deployed record at the same (chain, name): re-registering an external record updates
 * it, but a deployed one makes register fail (reset it first, or use a different name).
 */
export const register = <A extends Abi>(
  entry: RegisterEntry<A>,
  deps: PluginDeps,
): Effect.Effect<DeployResult<A>, DeploymentExists | InvalidDeploymentRecord, Clients | Store> =>
  Effect.gen(function* () {
    const clients = yield* Clients;
    const store = yield* Store;
    const network = networkKeyForChain(clients.chain);
    const existing = Option.getOrUndefined(yield* store.read(network, entry.name));
    if (existing !== undefined && existing.kind !== "external") {
      return yield* Effect.fail(new DeploymentExists({ network, name: entry.name }));
    }
    const now = deps.now();
    // The history is a log of changes, so re-registering the same address appends nothing —
    // otherwise every re-run of a deploy script would add an identical entry forever. A moved
    // address appends, and names what it replaced.
    const priorHistory = existing?.history ?? [];
    const lastLogged = priorHistory[priorHistory.length - 1];
    const alreadyLogged = lastLogged !== undefined && isAddressEqual(lastLogged.address, entry.address);
    const historyEntry: DeploymentHistoryEntry = {
      at: now,
      address: entry.address,
      transactionHash: "0x",
      deployer: clients.account,
      reason: { kind: "registered" },
      summary: "registered external contract",
      ...(existing === undefined || isAddressEqual(existing.address, entry.address)
        ? {}
        : { supersededAddress: existing.address }),
    };
    const record: DeploymentRecord = {
      schemaVersion: 2,
      contractName: entry.name,
      deploymentName: entry.name,
      address: entry.address,
      chainId: clients.chain.id,
      networkName: network,
      abi: entry.abi,
      bytecode: "0x",
      constructorArgs: [],
      transactionHash: "0x",
      deployer: clients.account,
      deployedAt: now,
      compiler: { version: "" },
      history: alreadyLogged ? priorHistory : [...priorHistory, historyEntry],
      kind: "external",
    };
    yield* store.write(record);
    // register never broadcasts a transaction, so freshDeploy is always false and there is no receipt.
    return {
      contract: clients.contractAt(entry.address, entry.abi),
      deployment: record,
      freshDeploy: false,
    };
  });
