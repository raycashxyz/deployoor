/**
 * deployoor — viem-first contract deployment.
 *
 * The user-facing flow is: run `deployoor generate` → import a generated per-contract
 * deployer → call it with a viem client. So the public surface is:
 *   - `defineConfig`  — author deployoor.config.ts
 *   - `definePlugin`  — author a plugin
 *   - the generated `getOrDeploy<Name>(...)` functions (built from `defineDeployer`),
 *     plus the project-level `register` / `reset` (from `defineRegister` / `defineReset`)
 *   - domain types + tagged errors
 *
 * `createDeployer` and the Effect engine are internal — generated deployers use
 * them; users never wire them by hand. The store is a pluggable `StoreAdapter`
 * (`fsStore` by default; inject your own via a deployer's `store` option, e.g. an
 * in-memory store in tests). Public API is Promise-only.
 */

// Config
export { defineConfig } from "./config";
export type { Config } from "./config";

// Generated-deployer factories (emitted by `deployoor generate`; users call their results)
export { defineDeployer, defineRegister, defineReset } from "./engine/deployer";
export type { DeployerCallOptions, RegisterCallOptions, ResetCallOptions } from "./engine/deployer";

// Plugin SDK
export { definePlugin } from "./plugin";
export type { DeployPlugin, DeployedContext, PluginDeps, PluginOverrides, Awaitable } from "./plugin";

// Domain types
export type { TypedArtifact } from "./schemas";
export { Address, Hex, AbiSchema, Artifact, ContractMetadata, DeploymentRecord, Libraries } from "./schemas";

// Store — the pluggable persistence adapter. Inject a custom `StoreAdapter` via a
// deployer's `store` call option (e.g. `memoryStore()` in tests); `fsStore` is the default.
export { fsStore, memoryStore, networkKeyForChain, networkSlug } from "./store";
export type { StoreAdapter, ChainIdentity } from "./store";

// Tagged errors (users match `err._tag` on a rejected promise)
export {
  DeploymentFailed,
  DeploymentChainMismatch,
  LibrariesUnlinked,
  ArtifactsNotFound,
  NoChainOnClient,
  InvalidDeploymentRecord,
  PluginFailed,
  DeploymentExists,
} from "./errors";
