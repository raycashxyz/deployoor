// The stable plugin-authoring surface, published under the `deployoor/plugin` subpath
// so plugin packages (e.g. @deployoor/etherscan) import a small, stable SDK instead of
// the whole engine. They peer-depend on `deployoor` and import only from here. (This
// may graduate to a standalone @deployoor/plugin package at extraction; the import
// path is the only thing that would change.)
export { definePlugin } from "./plugin";
export type {
  DeployPlugin,
  DeployedContext,
  PluginDeps,
  Awaitable,
  AnyDeployPlugin,
  PluginOverrides,
} from "./plugin";
export type { DeploymentRecord, ContractMetadata } from "./schemas";
