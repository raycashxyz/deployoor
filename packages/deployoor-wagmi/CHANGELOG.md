# @deployoor/wagmi

## 0.3.0

### Minor Changes

- 1cb8250: Use viem's `Hex`/`Address` types, cap peer ranges below the next major, and remove the deprecated `force` option.

  **BREAKING (pre-1.0)**

  - The `force` option is **gone** (it was deprecated one release ago and never shipped in that state): replace `force: true` with `redeploymentStrategy: 'always'` and `force: false` with `redeploymentStrategy: 'never'`.
  - `deployoor`'s zod validators are renamed to free the bare names for viem's types: `Hex` → `HexSchema`, `Address` → `AddressSchema`, `Bytecode` → `BytecodeSchema` (matching the existing `AbiSchema`). The exported record/artifact **types** are unchanged — they now spell their hex fields as viem's `Hex` and `Address`, which are structurally identical to the `` `0x${string}` `` they replace, so consumers need no change.

  **Peer ranges**

  viem 3 is imminent and `>=2` would have accepted it silently. Every `viem` peer is now `^2`; `@wagmi/cli` is `^2`, `@tevm/compiler` is capped `<2`, and `solc` `<0.9`. The plugin packages' `deployoor` peer was `*` — accepting any engine version, including breaking pre-1.0 minors — and is now `>=0.5.0 <1.0.0`. `@deployoor/testing` and `fhevm-tevm-mocks` additionally declared `viem >=2.49`, a floor their own catalog version (2.44.2) did not satisfy and that nothing required (tevm itself asks for `^2.37.9`). `@deployoor/wagmi` now declares the `viem` peer it always implicitly relied on.

  **Internal**

  - One `ensureHexPrefix` helper in `artifacts/parse.ts` replaces two copies of the "0x-prefix raw solc output" logic (`parse.ts` and `artifacts/tevm.ts`). It is deliberately not viem's `toHex`, which _encodes_ a string rather than prefixing it, and cannot assert `isHex` because unlinked bytecode legitimately contains `__$…$__` placeholders.
  - Fixed-width hex fields are built with `numberToHex(n, { size })` / `concatHex` / byte-indexed `slice` instead of `.toString(16).padStart(...)` and character arithmetic.
  - No `let`, `var`, or reassignment anywhere in the codebase, enforced by oxlint (`no-var`, `prefer-const`, `no-const-assign`, `no-param-reassign`, `no-plusplus`). The accumulator in `codegen/generate.ts` is a `.flatMap`, the tevm fully-qualified-name dedupe is a `.reduce`, and the deploy tests get their EVM clients from a top-level `await` rather than a `let` filled in by `beforeAll`.
  - Dropped a duplicate `tevm` devDependency in `fhevm-tevm-mocks` (already a `dependencies` entry at the same version).

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
