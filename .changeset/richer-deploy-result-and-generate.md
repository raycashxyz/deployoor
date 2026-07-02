---
"deployoor": minor
---

`getOrDeploy` and `register` now resolve to a `DeployResult` — `{ contract, deployment, freshDeploy, receipt? }` — instead of the bare viem contract. `contract` is the typed viem object (same one as before); `freshDeploy` is `true` only when the call broadcast a deploy transaction (so it is `false` on idempotent reuse and always for `register`); `receipt` is the deploy receipt, present only on a fresh deploy; `deployment` is the full record. This lets a deploy script run one-time setup only when it actually deployed.

**BREAKING (pre-1.0):** callers that used the return value as a contract must destructure it — `const token = await getOrDeployToken(...)` becomes `const { contract: token } = await getOrDeployToken(...)`.

Also adds the `deployoor/generate` subpath, exporting `generateDeployers({ root })` — the programmatic form of `deployoor generate` (discover config → read artifacts → write typed deployers) so a build tool can run generation in process. `@deployoor/hardhat` uses it.
