import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import type { Config } from "../config";
import type { AnyDeployPlugin, PluginDeps, VerifyContext } from "../plugin";
import type { ContractMetadata, DeploymentRecord, SourcesSidecar } from "../schemas";
import { fsStore, type StoreAdapter } from "../store";

/**
 * `deployoor verify` — verify already-deployed contracts on a block explorer after the fact,
 * from committed data only. Nothing is recompiled and no artifact directory is read.
 *
 * A deployment record plus the pinned sources it points at (`sourcesHash` →
 * `deployments/sources/<hash>.json`) already carry every input a standard-json verify needs:
 *
 *   chain id, address, constructor args, libraries   ← the record
 *   fully-qualified name, compiler version, std-json ← the sidecar
 *
 * The constructor args round-trip losslessly even though the record is vanilla JSON: `fsStore`
 * writes bigints as decimal *strings*, and `encodeAbiParameters` accepts those for integer types.
 *
 * Verification itself is delegated to the plugins in `deployoor.config.ts` through their `onVerify`
 * hook, so whatever explorer the user configured (Etherscan, Sourcify, a Blockscout instance) is
 * what runs. `onVerify` exists precisely so this is not `onContractDeployed` in disguise: a plugin
 * that does not implement it is skipped, which is how a notifier stays quiet here without inspecting
 * anything, and a verifier gets a context with no absent `receipt` and no `reused` flag to misread.
 *
 * Plain async + console, like the rest of `cli/` — Effect stays inside the deploy engine.
 */

const DEFAULT_DEPLOYMENTS_PATH = "./deployments";

/** Why `runVerify` refused the request outright, rather than reporting a per-record outcome. */
export type VerifyRequestErrorKind =
  /** The command line could not be parsed. */
  | "bad-usage"
  /** No configured plugin implements `onVerify`, so the run could only ever be a no-op. */
  | "no-plugins"
  /** `--plugin` named something the config does not have, or something that cannot verify. */
  | "unknown-plugin"
  /** The filters selected no deployment records. */
  | "no-records";

export class VerifyRequestError extends Error {
  readonly kind: VerifyRequestErrorKind;
  constructor(kind: VerifyRequestErrorKind, message: string) {
    super(message);
    this.name = "VerifyRequestError";
    this.kind = kind;
  }
}

export interface PluginFailure {
  readonly plugin: string;
  readonly error: string;
}

export type VerifyOutcome =
  /** Every selected plugin returned without throwing (already-verified counts as success). */
  | { readonly status: "verified"; readonly plugins: ReadonlyArray<string> }
  | {
      readonly status: "failed";
      readonly plugins: ReadonlyArray<string>;
      readonly failures: ReadonlyArray<PluginFailure>;
    }
  /** The committed data is not enough to verify this record. `detail` says what is missing. */
  | { readonly status: "unverifiable"; readonly detail: string }
  /** Nothing to verify (an externally registered contract). Does not fail the run. */
  | { readonly status: "skipped"; readonly detail: string };

export interface VerifyResult {
  readonly deploymentName: string;
  readonly contractName: string;
  readonly networkName: string;
  readonly chainId: number;
  readonly address: Address;
  readonly outcome: VerifyOutcome;
}

export interface VerifyReport {
  readonly results: ReadonlyArray<VerifyResult>;
  /** Which plugins the run asked to verify with. */
  readonly plugins: ReadonlyArray<string>;
  /** False when any selected record failed verification or could not be verified at all. */
  readonly ok: boolean;
}

export interface VerifyArgs {
  /** Network key (`11155111-sepolia`), its chain id (`11155111`), or its slug (`sepolia`). */
  readonly network?: string;
  /** A deployment name or contract name, case-insensitive. */
  readonly contract?: string;
  /** Restrict to these plugin names. Default: every configured plugin that implements `onVerify`. */
  readonly plugins?: ReadonlyArray<string>;
}

export interface RunVerifyOptions extends VerifyArgs {
  /** Project root — the config's `deploymentsPath` is resolved against it. */
  readonly root: string;
  readonly config: Config;
  /** Store override (default: `fsStore` at the config's `deploymentsPath`). */
  readonly store?: StoreAdapter;
  /** Plugin dependencies. Defaults to the real `fetch`, `Date.now` and `console`. */
  readonly deps?: Partial<PluginDeps>;
}

/** The flag block on its own, so the top-level `deployoor --help` can list it without a second "usage:". */
export const VERIFY_FLAG_HELP = `  --network <key>     only records on this network — \`11155111-sepolia\`, \`11155111\`, or \`sepolia\`
  --contract <name>   only this deployment or contract name
  --plugin <name>     verify with only this configured plugin (repeatable)`;

export const VERIFY_USAGE = `usage: deployoor verify [--network <key>] [--contract <name>] [--plugin <name>]

${VERIFY_FLAG_HELP}`;

const VERIFY_FLAGS = ["network", "contract", "plugin"] as const;

/** `--flag value` and `--flag=value`, with the value never allowed to be another flag. */
const valuesOf = (argv: ReadonlyArray<string>, name: string): ReadonlyArray<string> =>
  argv.flatMap((token, index) => {
    if (token === `--${name}`) {
      const value = argv[index + 1];
      return value === undefined || value.startsWith("--") ? [] : [value];
    }
    return token.startsWith(`--${name}=`) ? [token.slice(name.length + 3)] : [];
  });

const missingValueFor = (argv: ReadonlyArray<string>, name: string): boolean =>
  argv.some((token, index) => {
    if (token !== `--${name}`) return false;
    const value = argv[index + 1];
    return value === undefined || value.startsWith("--");
  });

/** Everything that looks like a flag, so a typo fails instead of being silently ignored. */
const flagNames = (argv: ReadonlyArray<string>): ReadonlyArray<string> =>
  argv
    .filter((token) => token.startsWith("--"))
    .map((token) => token.slice(2).split("=")[0] ?? "")
    .filter((name) => name.length > 0);

/** Parse `deployoor verify`'s own arguments (everything after the command word). */
export const parseVerifyArgs = (argv: ReadonlyArray<string>): VerifyArgs => {
  const unknown = flagNames(argv).filter((name) => !VERIFY_FLAGS.some((flag) => flag === name));
  if (unknown.length > 0) {
    throw new VerifyRequestError(
      "bad-usage",
      `unknown option(s) ${unknown.map((name) => `--${name}`).join(", ")}\n${VERIFY_USAGE}`,
    );
  }
  const missing = VERIFY_FLAGS.filter((flag) => missingValueFor(argv, flag));
  if (missing.length > 0) {
    throw new VerifyRequestError(
      "bad-usage",
      `${missing.map((flag) => `--${flag}`).join(", ")} needs a value\n${VERIFY_USAGE}`,
    );
  }
  const positional = argv.filter((token, index) => {
    if (token.startsWith("--")) return false;
    const previous = argv[index - 1];
    return previous === undefined || !VERIFY_FLAGS.some((flag) => previous === `--${flag}`);
  });
  if (positional.length > 0) {
    throw new VerifyRequestError(
      "bad-usage",
      `unexpected argument(s) ${positional.join(", ")}\n${VERIFY_USAGE}`,
    );
  }
  const networks = valuesOf(argv, "network");
  const contracts = valuesOf(argv, "contract");
  const plugins = valuesOf(argv, "plugin");
  return {
    ...(networks.length === 0 ? {} : { network: networks[networks.length - 1] }),
    ...(contracts.length === 0 ? {} : { contract: contracts[contracts.length - 1] }),
    ...(plugins.length === 0 ? {} : { plugins }),
  };
};

const describeCause = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

const resolveDeps = (over?: Partial<PluginDeps>): PluginDeps => ({
  fetch: globalThis.fetch,
  now: () => Date.now(),
  log: { info: (message) => console.info(message), warn: (message) => console.warn(message) },
  ...over,
});

/**
 * A network filter matches the full key, the chain id, or the slug — the key is
 * `<chainId>-<slug>` and users reach for any of the three.
 */
const matchesNetwork = (record: DeploymentRecord, filter: string): boolean => {
  const want = filter.trim().toLowerCase();
  const key = record.networkName.toLowerCase();
  return key === want || key.split("-").slice(1).join("-") === want || String(record.chainId) === want;
};

const matchesContract = (record: DeploymentRecord, filter: string): boolean => {
  const want = filter.trim().toLowerCase();
  return record.deploymentName.toLowerCase() === want || record.contractName.toLowerCase() === want;
};

/**
 * A verifier is a plugin that implements `onVerify`. Everything else in `plugins` is skipped
 * silently — that is the whole point of the dedicated hook, and it is what keeps a notifier quiet
 * on a verify run. If nothing implements it there is no work to do, which is worth an error
 * rather than a run that reports zero of everything.
 */
const selectPlugins = (
  configured: ReadonlyArray<AnyDeployPlugin>,
  requested: ReadonlyArray<string> | undefined,
): ReadonlyArray<AnyDeployPlugin> => {
  const verifiers = configured.filter((plugin) => plugin.onVerify !== undefined);
  if (verifiers.length === 0) {
    const configuredNames =
      configured.length === 0
        ? "deployoor.config.ts configures no plugins"
        : `configured: ${configured.map((plugin) => plugin.name).join(", ")}`;
    throw new VerifyRequestError(
      "no-plugins",
      [
        `no configured plugin implements onVerify, so there is nothing to verify with (${configuredNames}).`,
        "",
        "`deployoor verify` submits through a verifier plugin, so add one:",
        '  import { etherscan } from "@deployoor/etherscan";',
        "  export default defineConfig({ plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY! })] });",
      ].join("\n"),
    );
  }
  if (requested === undefined) return verifiers;
  const unknown = requested.filter((name) => !verifiers.some((plugin) => plugin.name === name));
  if (unknown.length > 0) {
    throw new VerifyRequestError(
      "unknown-plugin",
      `no configured plugin named ${unknown.join(", ")} implements onVerify — the ones that do are ${verifiers.map((plugin) => plugin.name).join(", ")}`,
    );
  }
  return verifiers.filter((plugin) => requested.includes(plugin.name));
};

const readRecords = async (
  store: StoreAdapter,
  network: string | undefined,
): Promise<ReadonlyArray<DeploymentRecord>> => {
  const listAll = store.listAll;
  if (listAll !== undefined) return listAll();
  if (network === undefined) {
    throw new VerifyRequestError(
      "no-records",
      "the configured store cannot list every network — pass `--network <chainId>-<slug>`",
    );
  }
  return store.list(network);
};

type ReadSources = NonNullable<StoreAdapter["readSources"]>;

type SidecarRead =
  | { readonly ok: true; readonly sidecar: SourcesSidecar | null }
  | { readonly ok: false; readonly detail: string };

// A corrupt or schema-invalid blob rejects rather than resolving null, and one bad record must not
// end the whole run — so the try lives here and returns its outcome.
const readSidecar = async (read: ReadSources, hash: Hex): Promise<SidecarRead> => {
  try {
    return { ok: true, sidecar: await read(hash) };
  } catch (cause) {
    return { ok: false, detail: `pinned sources ${hash} could not be read: ${describeCause(cause)}` };
  }
};

type ResolvedMetadata =
  | { readonly ok: true; readonly metadata: ContractMetadata }
  | { readonly ok: false; readonly detail: string };

/**
 * Rebuild the verifier input from the pinned sidecar.
 *
 * Without a `sourcesHash` there is no path to it: the fully-qualified contract name lives only in
 * the sidecar (the record has `contractName`, which is not the `path/File.sol:Name` an explorer
 * wants), and neither does the record carry the standard-json input. Recovering either would mean
 * recompiling, which is exactly what this command exists not to do.
 */
const resolveMetadata = async (store: StoreAdapter, record: DeploymentRecord): Promise<ResolvedMetadata> => {
  const hash = record.sourcesHash;
  if (hash === undefined) {
    return {
      ok: false,
      detail:
        "no sourcesHash — this record's verification sources were never pinned (a v1 record, or a store that pins none), so neither the fully-qualified name nor the standard-json input is recoverable from committed data. Redeploy it (or verify from the compiled artifact with your explorer's own tooling).",
    };
  }
  const read = store.readSources;
  if (read === undefined) return { ok: false, detail: "the configured store cannot read pinned sources" };
  const result = await readSidecar(read, hash);
  if (!result.ok) return result;
  if (result.sidecar === null) {
    return { ok: false, detail: `pinned sources ${hash} are missing (sources/${hash}.json is not there)` };
  }
  const { fullyQualifiedName, compilerVersion, standardJsonInput } = result.sidecar;
  return {
    ok: true,
    metadata: {
      fullyQualifiedName,
      compilerVersion,
      standardJsonInput,
      // Not pinned, and not needed here: the placeholders only exist to link bytecode at deploy
      // time, whereas a standard-json verify links through `settings.libraries` in the input above.
      libraryPlaceholders: {},
    },
  };
};

interface HookOutcome {
  readonly plugin: string;
  readonly failure?: string;
}

// A throwing hook fails only its own contract, so the try lives here and returns its outcome.
// (`selectPlugins` has already dropped anything without `onVerify`; the guard is the narrowing.)
const runHook = async (
  plugin: AnyDeployPlugin,
  ctx: VerifyContext,
  deps: PluginDeps,
): Promise<HookOutcome> => {
  const hook = plugin.onVerify;
  if (hook === undefined) return { plugin: plugin.name };
  try {
    await hook(ctx, deps);
    return { plugin: plugin.name };
  } catch (cause) {
    return { plugin: plugin.name, failure: describeCause(cause) };
  }
};

/**
 * Run `step` over `items` one at a time. Explorers rate-limit and the printed report should be in
 * record order, so verification is deliberately sequential rather than `Promise.all`.
 */
const series = async <T, R>(
  items: ReadonlyArray<T>,
  step: (item: T) => Promise<R>,
): Promise<ReadonlyArray<R>> =>
  items.reduce<Promise<R[]>>(
    async (previous, item) => [...(await previous), await step(item)],
    Promise.resolve([]),
  );

const verifyRecord = async (
  record: DeploymentRecord,
  plugins: ReadonlyArray<AnyDeployPlugin>,
  store: StoreAdapter,
  deps: PluginDeps,
): Promise<VerifyResult> => {
  const identity = {
    deploymentName: record.deploymentName,
    contractName: record.contractName,
    networkName: record.networkName,
    chainId: record.chainId,
    address: record.address,
  };
  if (record.kind === "external") {
    return {
      ...identity,
      outcome: {
        status: "skipped",
        detail: "registered external contract — deployoor did not deploy it, so it has no sources here",
      },
    };
  }
  const resolved = await resolveMetadata(store, record);
  if (!resolved.ok) return { ...identity, outcome: { status: "unverifiable", detail: resolved.detail } };

  // Metadata is resolved before this point precisely so `VerifyContext.metadata` can be required:
  // a record without pinned sources is reported above and never reaches a plugin.
  const ctx: VerifyContext = { deployment: record, metadata: resolved.metadata, options: {} };
  const outcomes = await series(plugins, (plugin) => runHook(plugin, ctx, deps));
  const names = outcomes.map((outcome) => outcome.plugin);
  const failures = outcomes.flatMap((outcome) =>
    outcome.failure === undefined ? [] : [{ plugin: outcome.plugin, error: outcome.failure }],
  );
  return failures.length === 0
    ? { ...identity, outcome: { status: "verified", plugins: names } }
    : { ...identity, outcome: { status: "failed", plugins: names, failures } };
};

const describeFilters = (opts: VerifyArgs): string => {
  const parts = [
    ...(opts.network === undefined ? [] : [`--network ${opts.network}`]),
    ...(opts.contract === undefined ? [] : [`--contract ${opts.contract}`]),
  ];
  return parts.length === 0 ? "" : ` matching ${parts.join(" ")}`;
};

const listAvailable = (records: ReadonlyArray<DeploymentRecord>): string => {
  const names = records.map((record) => `${record.networkName}/${record.deploymentName}`).sort();
  if (names.length === 0) return "";
  const shown = names.slice(0, 8).join(", ");
  return `\n\nRecords found: ${shown}${names.length > 8 ? `, … (${names.length} total)` : ""}`;
};

/**
 * The testable core of `deployoor verify`: read records → resolve pinned sources → hand each to the
 * configured verifier plugins. Rejects only when the *request* is unusable (nothing configured that
 * can verify, or filters that select nothing); a record that cannot be verified is reported as an
 * `unverifiable` outcome so one gap never ends the run.
 */
export const runVerify = async (opts: RunVerifyOptions): Promise<VerifyReport> => {
  const store =
    opts.store ?? fsStore(resolve(opts.root, opts.config.deploymentsPath ?? DEFAULT_DEPLOYMENTS_PATH));
  const plugins = selectPlugins(opts.config.plugins ?? [], opts.plugins);
  const deps = resolveDeps(opts.deps);

  const all = await readRecords(store, opts.network);
  const records = all
    .filter((record) => opts.network === undefined || matchesNetwork(record, opts.network))
    .filter((record) => opts.contract === undefined || matchesContract(record, opts.contract));
  if (records.length === 0) {
    throw new VerifyRequestError(
      "no-records",
      `no deployment records${describeFilters(opts)} under ${resolve(opts.root, opts.config.deploymentsPath ?? DEFAULT_DEPLOYMENTS_PATH)}${listAvailable(all)}`,
    );
  }

  const results = await series(records, (record) => verifyRecord(record, plugins, store, deps));
  return {
    results,
    plugins: plugins.map((plugin) => plugin.name),
    ok: results.every(
      (result) => result.outcome.status === "verified" || result.outcome.status === "skipped",
    ),
  };
};
