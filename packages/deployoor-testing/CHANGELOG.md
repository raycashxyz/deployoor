# @deployoor/testing

## 0.3.0

### Minor Changes

- 7913ff9: Point repository metadata at `raycashxyz/deployoor` after transferring the GitHub org.

## 0.2.2

### Patch Changes

- 7814c6d: Declare `zod` as a dependency. `@deployoor/testing` reaches zod v4 APIs (`treeifyError`) when validating deployment records, but did not declare zod — so under a hoisted node-linker a consumer's zod v3 could shadow it and crash at import ("does not provide an export named 'treeifyError'"). Pinned to `^4.4.3`, matching the other deployoor packages.

## 0.2.1

### Patch Changes

- 5b411a5: Docs: include peer deps (`deployoor`, `viem`) in the `@deployoor/testing` install command, and fix the broken relative `deployoor` link in the `@deployoor/hardhat` README so it resolves on the npm package page.

## 0.2.0

### Minor Changes

- 2a34f70: Add `@deployoor/testing`: `createTestClients()` boots an in-memory EVM (tevm) exposed as viem wallet/public clients, so you can test deploys against a real EVM with no local node. The tevm version is pinned by the package.
- 2a34f70: Harden deployment records and test helpers: records now carry `schemaVersion: 1`, use chain-id-based filesystem keys, guard chainId mismatches on reuse, warn on stale bytecode/constructor args, and write filesystem records atomically under a lock. `@deployoor/testing` now exposes tevm, cheatcodes, fixtures, and deployment-record seeding (seeded records are remapped onto the in-memory chain so `getOrDeploy` reuses them). Verifier plugins can retry reused deployments when artifact metadata is available, Slack can notify failed deploys, and the wagmi plugin uses Zod 4-safe validators with ABI drift checks.

  **BREAKING (pre-1.0):** the record folder layout changed from `deployments/<chain name>/` to `deployments/<chainId>-<slug>/` (e.g. `deployments/sepolia/` → `deployments/11155111-sepolia/`), and the record's `networkName` field now holds that composite key. Records written by 0.1.x are not read from the old location — move each folder to its new name (and update `networkName` inside the files, or let the next deploy rewrite them) before re-running deploy scripts, or `getOrDeploy` will redeploy.

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.
- c12b352: Docs and tests updated for deployoor's new `getOrDeploy` return shape (`{ contract, freshDeploy, receipt, deployment }`): the README snippets and the `createTestClients` JSDoc example now destructure `const { contract: token } = await getOrDeployToken(...)`, and the seeded-record reuse test reads `result.contract` and asserts `freshDeploy: false`. No API or runtime change to `@deployoor/testing` itself.
