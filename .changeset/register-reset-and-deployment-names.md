---
"deployoor": minor
---

Expose `register` and `reset` as project-level entry points. `deployoor generate` now emits both in the deployers index (config-bound, scoped to the client's chain): `register({ walletClient, publicClient, deploymentName, address, abi })` records a contract you didn't deploy (e.g. USDC) with no transaction and returns its viem object, and `reset({ publicClient, deploymentName? })` forgets recorded deployment(s) so the next `getOrDeploy` redeploys. Adds the public factories `defineRegister` / `defineReset`. The older `name` spelling is accepted as a compatibility alias.

Registered records are marked `kind: "external"`, and `register` will not overwrite a real deployment at the same `(chain, name)` — it fails with `DeploymentExists` (reset it first, or use a different name); re-registering an external record updates it. `reset` is a pure local-records operation and needs only a `publicClient` (no signer).

Also documents `deploymentName` (defaults to the contract name) for deploying and tracking multiple instances of the same contract.
