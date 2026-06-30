import type { TransactionReceipt } from "viem";
import type { ContractMetadata, DeploymentRecord } from "./schemas";

/**
 * Plugin SDK surface. Hooks are plain async (or sync) — the engine lifts them
 * into Effect and runs them best-effort. Plugin authors never touch Effect.
 *
 * Milestone 2 wires exactly one hook: `onContractDeployed`. More hooks are
 * added only when the engine wires them (no dangling, unwired surface).
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
  /** Compiler inputs for verification; present only on a fresh deploy. */
  readonly metadata?: ContractMetadata;
  /** Per-deploy config addressed to this plugin (merged from `plugins[name]`). */
  readonly options: Options;
}

export interface DeployPlugin<Options = unknown> {
  readonly name: string;
  readonly onContractDeployed?: (ctx: DeployedContext<Options>, deps: PluginDeps) => Awaitable<void>;
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
