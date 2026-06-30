/**
 * deployoor — viem-first contract deployment.
 *
 * The user-facing flow is: run `deployoor generate` → import a generated per-contract
 * deployer → call it with a viem client. So the public surface is:
 *   - `defineConfig`  — author deployoor.config.ts
 *   - `definePlugin`  — author a plugin
 *   - the generated `deploy<Name>(...)` functions (built from `defineDeployer`)
 *   - domain types + tagged errors
 *
 * `createDeployer`, the store, and the Effect engine are internal — generated
 * deployers use them; users never wire them by hand. Public API is Promise-only.
 */

// Config
export { defineConfig } from "./config";
export type { Config } from "./config";

// Generated-deployer factory (emitted by `deployoor generate`; users call its result)
export { defineDeployer } from "./engine/deployer";
export type { DeployerCallOptions } from "./engine/deployer";

// Plugin SDK
export { definePlugin } from "./plugin";
export type { DeployPlugin, DeployedContext, PluginDeps, PluginOverrides, Awaitable } from "./plugin";

// Domain types
export type { TypedArtifact } from "./schemas";
export { Address, Hex, AbiSchema, Artifact, ContractMetadata, DeploymentRecord, Libraries } from "./schemas";

// Tagged errors (users match `err._tag` on a rejected promise)
export {
  DeploymentFailed,
  LibrariesUnlinked,
  ArtifactsNotFound,
  NoChainOnClient,
  InvalidDeploymentRecord,
  PluginFailed,
} from "./errors";
