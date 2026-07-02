import { Effect, Option } from "effect";
import type { Abi, Address } from "viem";
import { Clients, type DeployResult } from "../services/clients";
import { Store } from "../services/store";
import { DeploymentChainMismatch, DeploymentExists, DeploymentFailed } from "../errors";
import type { InvalidDeploymentRecord, LibrariesUnlinked, PluginFailed } from "../errors";
import { linkLibraries } from "./link-libraries";
import { resolveActive, runOnContractDeployed, runOnDeployFailed, type OnPluginError } from "./plugins";
import type { AnyDeployPlugin, PluginDeps } from "../plugin";
import type { DeploymentRecord, Libraries, TypedArtifact } from "../schemas";
import { networkKeyForChain } from "../store";

export interface GetOrDeployOptions {
  readonly args: readonly unknown[];
  readonly deploymentName?: string;
  readonly force?: boolean;
  readonly libraries?: Libraries;
  readonly plugins?: Readonly<Record<string, unknown>>;
  readonly onPluginError?: OnPluginError;
}

const jsonKey = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? inner.toString() : inner));

const warnIfStale = (
  existing: DeploymentRecord,
  artifact: TypedArtifact,
  args: readonly unknown[],
  deps: PluginDeps,
): void => {
  if (existing.kind !== "external" && existing.bytecode !== artifact.bytecode) {
    deps.log.warn(
      `[deployoor] Reusing ${existing.deploymentName} at ${existing.address}, but the current artifact bytecode differs. Pass force: true to redeploy intentionally.`,
    );
  }
  if (jsonKey(existing.constructorArgs) !== jsonKey([...args])) {
    deps.log.warn(
      `[deployoor] Reusing ${existing.deploymentName} at ${existing.address}, but constructor args differ from the recorded deployment. Pass force: true to redeploy intentionally.`,
    );
  }
};

/**
 * The deploy pipeline, read top-to-bottom. Idempotent: a recorded deployment is
 * returned without a transaction unless `force` is set.
 */
export const getOrDeploy = <A extends Abi>(
  artifact: TypedArtifact<A>,
  opts: GetOrDeployOptions,
  plugins: ReadonlyArray<AnyDeployPlugin>,
  deps: PluginDeps,
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

    const release = yield* store.lock(network, name);
    const runLocked = Effect.gen(function* () {
      const existing = yield* store.read(network, name);
      if (Option.isSome(existing) && opts.force !== true) {
        if (existing.value.chainId !== clients.chain.id) {
          return yield* Effect.fail(
            new DeploymentChainMismatch({
              deploymentName: name,
              expectedChainId: clients.chain.id,
              actualChainId: existing.value.chainId,
            }),
          );
        }
        warnIfStale(existing.value, artifact, opts.args, deps);
        yield* runOnContractDeployed(
          active,
          { deployment: existing.value, reused: true, metadata: artifact.metadata },
          deps,
          onError,
        );
        return {
          contract: clients.contractAt(existing.value.address, artifact.abi),
          deployment: existing.value,
          freshDeploy: false,
        };
      }

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

      // Merge the compile-time artifact (abi, bytecode, compiler metadata) with the
      // runtime deploy result (address, tx, deployer, chain, args) into the record.
      const record: DeploymentRecord = {
        schemaVersion: 1,
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
        deployedAt: deps.now(),
        compiler: {
          version: artifact.metadata.compilerVersion,
          settings: artifact.metadata.standardJsonInput.settings,
        },
        // Record the linked libraries so a library-dependent deployment round-trips
        // (the stored bytecode keeps solc's placeholders; the addresses live here).
        ...(opts.libraries === undefined ? {} : { libraries: opts.libraries }),
        kind: "standard",
      };
      yield* store.write(record);
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
    const existing = yield* store.read(network, entry.name);
    if (Option.isSome(existing) && existing.value.kind !== "external") {
      return yield* Effect.fail(new DeploymentExists({ network, name: entry.name }));
    }
    const record: DeploymentRecord = {
      schemaVersion: 1,
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
      deployedAt: deps.now(),
      compiler: { version: "" },
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
