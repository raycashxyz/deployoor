import type { TransactionReceipt } from "viem";
import type { ContractMetadata, DeploymentRecord } from "./schemas";

/**
 * Plugin SDK surface. Hooks are plain async (or sync) — the engine lifts them
 * into Effect and runs them best-effort. Plugin authors never touch Effect.
 *
 * Hooks are added only when something calls them (no dangling, unwired surface).
 * `onContractDeployed` / `onDeployFailed` are the deploy pipeline's; `onVerify` is
 * `deployoor verify`'s.
 */

export type Awaitable<T> = T | Promise<T>;

export interface PluginDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly log: { info: (message: string) => void; warn: (message: string) => void };
}

export interface DeployedContext<Options = unknown> {
  /** The resolved deployment record (freshly deployed or reused from the store). */
  readonly deployment: DeploymentRecord;
  /** True when the contract was already deployed and returned from the store. */
  readonly reused: boolean;
  /** Present only on a fresh deploy. */
  readonly receipt?: TransactionReceipt;
  /**
   * Compiler inputs for verification, from the artifact the deploy resolved — present on a fresh
   * deploy and on a reused one, so a verifier can retry without forcing a redeploy. Absent when the
   * deploy had none to offer.
   */
  readonly metadata?: ContractMetadata;
  /** Per-deploy config addressed to this plugin (merged from `plugins[name]`). */
  readonly options: Options;
}

/**
 * What `deployoor verify` hands a plugin: a recorded deployment plus the verification input pinned
 * beside it, read back from `deployments/sources/<hash>.json`.
 *
 * Deliberately not a `DeployedContext`. Nothing was deployed, so there is no `receipt` and no
 * meaningful `reused`, and `metadata` is **required** rather than optional — a record whose sources
 * were never pinned cannot be verified from committed data at all, so it is reported as unverifiable
 * and never reaches a plugin. A verifier written against this context needs no undefined-checks and
 * cannot mistake a verify run for a deploy.
 */
export interface VerifyContext<Options = unknown> {
  /** The recorded deployment being verified — address, chain, abi, constructor args, libraries. */
  readonly deployment: DeploymentRecord;
  /** The pinned compiler input: fully-qualified name, compiler version, standard-json. */
  readonly metadata: ContractMetadata;
  /** Config addressed to this plugin (from `plugins[name]` in deployoor.config.ts). */
  readonly options: Options;
}

export interface DeployFailedContext<Options = unknown> {
  readonly contractName: string;
  readonly deploymentName: string;
  readonly chainId: number;
  readonly networkName: string;
  readonly cause: unknown;
  /** Per-deploy config addressed to this plugin (merged from `plugins[name]`). */
  readonly options: Options;
}

export interface DeployPlugin<Options = unknown> {
  readonly name: string;
  readonly onContractDeployed?: (ctx: DeployedContext<Options>, deps: PluginDeps) => Awaitable<void>;
  readonly onDeployFailed?: (ctx: DeployFailedContext<Options>, deps: PluginDeps) => Awaitable<void>;
  /**
   * Verify an already-recorded deployment. Called only by `deployoor verify`, never by a deploy, and
   * a plugin that omits it is skipped by that command — which is how a notifier stays quiet on a
   * verify run without having to inspect anything. A verifier should implement both this and
   * `onContractDeployed` (sharing one body), so it works at deploy time and after the fact.
   *
   * Throwing marks that contract's verification as failed for this plugin; the run continues to the
   * next contract and exits non-zero at the end.
   */
  readonly onVerify?: (ctx: VerifyContext<Options>, deps: PluginDeps) => Awaitable<void>;
}

/** Preserves the literal `name` and the `Options` type for typed per-deploy overrides. */
export const definePlugin = <const Name extends string, Options = unknown>(
  plugin: DeployPlugin<Options> & { readonly name: Name },
): DeployPlugin<Options> & { readonly name: Name } => plugin;

/**
 * A plugin of any option type. The `any` is variance handling for heterogeneous
 * plugin tuples (DeployPlugin is contravariant in Options) — not a runtime hole.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDeployPlugin = DeployPlugin<any>;

type OptionsOf<T> = T extends DeployPlugin<infer O> ? O : never;

/** Per-deploy plugin overrides, keyed by the registered plugin names. */
export type PluginOverrides<P extends readonly AnyDeployPlugin[]> = {
  readonly [K in P[number] as K["name"]]?: false | OptionsOf<K>;
};
