import type { Config, RedeploymentStrategy } from "../config";

/**
 * Resolve the redeployment strategy for a single `getOrDeploy` call. Highest wins:
 *   1. per-call `redeploymentStrategy`
 *   2. the deprecated boolean `force` (`true` → 'always', `false` → 'never')
 *   3. the per-chain config override (`redeploymentStrategyByChainId[chainId]`)
 *   4. the global config default (`redeploymentStrategy`)
 *   5. the built-in default `'on-change'`
 */
export const resolveStrategy = (
  opts: { readonly redeploymentStrategy?: RedeploymentStrategy; readonly force?: boolean },
  config: Pick<Config, "redeploymentStrategy" | "redeploymentStrategyByChainId">,
  chainId: number,
): RedeploymentStrategy => {
  if (opts.redeploymentStrategy !== undefined) return opts.redeploymentStrategy;
  if (opts.force !== undefined) return opts.force ? "always" : "never";
  return config.redeploymentStrategyByChainId?.[chainId] ?? config.redeploymentStrategy ?? "on-change";
};
