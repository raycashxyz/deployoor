import type { Config, RedeploymentStrategy } from "../config";

/**
 * Resolve the redeployment strategy for a single `getOrDeploy` call. Highest wins:
 *   1. per-call `redeploymentStrategy`
 *   2. the per-chain config override (`redeploymentStrategyByChainId[chainId]`)
 *   3. the global config default (`redeploymentStrategy`)
 *   4. the built-in default `'on-change'`
 */
export const resolveStrategy = (
  opts: { readonly redeploymentStrategy?: RedeploymentStrategy },
  config: Pick<Config, "redeploymentStrategy" | "redeploymentStrategyByChainId">,
  chainId: number,
): RedeploymentStrategy =>
  opts.redeploymentStrategy ??
  config.redeploymentStrategyByChainId?.[chainId] ??
  config.redeploymentStrategy ??
  "on-change";
