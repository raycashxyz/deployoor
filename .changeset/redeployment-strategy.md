---
"deployoor": minor
---

Add `redeploymentStrategy` and redeploy-on-change.

`getOrDeploy` now decides reuse-vs-redeploy by a `redeploymentStrategy` — `'on-change'` (the new default), `'never'`, or `'always'` — settable per call, as a config default, or per chain via `redeploymentStrategyByChainId`. `'on-change'` redeploys when the **deploy identity** (metadata-stripped runtime bytecode + constructor args + linked library addresses) changes, so a redeployed dependency's new address cascades through the contracts that take it — while a comment-only recompile does not redeploy.

Deployment records are now `schemaVersion: 2`: they carry `deployedBytecode`, an `identityHash`, and an append-only `history` of every (re)deploy with a descriptive `reason`/`summary` (v1 records still read, and upgrade in place on the next deploy). Each deploy also writes a committed `<Name>.sources.json` sidecar pinning the exact solc standard-json input, so a deployment stays verifiable on a block explorer later — independent of the current source tree.

BREAKING (pre-1.0): the default is now `'on-change'` rather than reuse-only, so a changed contract redeploys on re-run. Set `redeploymentStrategy: 'never'` (globally or per chain) to restore the old behaviour. The boolean `force` option is deprecated — `force: true` maps to `'always'`, `force: false` to `'never'`.
