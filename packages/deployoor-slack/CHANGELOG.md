# @deployoor/slack

## 0.2.0

### Minor Changes

- 7913ff9: Point repository metadata at `raycashxyz/deployoor` after transferring the GitHub org.

## 0.1.1

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.
- 2a34f70: Harden deployment records and test helpers: records now carry `schemaVersion: 1`, use chain-id-based filesystem keys, guard chainId mismatches on reuse, warn on stale bytecode/constructor args, and write filesystem records atomically under a lock. `@deployoor/testing` now exposes tevm, cheatcodes, fixtures, and deployment-record seeding (seeded records are remapped onto the in-memory chain so `getOrDeploy` reuses them). Verifier plugins can retry reused deployments when artifact metadata is available, Slack can notify failed deploys, and the wagmi plugin uses Zod 4-safe validators with ABI drift checks.

  **BREAKING (pre-1.0):** the record folder layout changed from `deployments/<chain name>/` to `deployments/<chainId>-<slug>/` (e.g. `deployments/sepolia/` → `deployments/11155111-sepolia/`), and the record's `networkName` field now holds that composite key. Records written by 0.1.x are not read from the old location — move each folder to its new name (and update `networkName` inside the files, or let the next deploy rewrite them) before re-running deploy scripts, or `getOrDeploy` will redeploy.

## 0.1.0

### Minor Changes

- 15fab66: Initial public release of deployoor: viem-first contract deployment with a `deployments/` source of truth, idempotent `getOrDeploy<Name>` deployers, the `deployoor/plugin` lifecycle SDK, and the `@deployoor/wagmi` / `@deployoor/etherscan` / `@deployoor/sourcify` / `@deployoor/slack` plugins.
