---
"deployoor": minor
"@deployoor/wagmi": minor
"@deployoor/testing": patch
"@deployoor/etherscan": patch
"@deployoor/sourcify": patch
"@deployoor/slack": patch
"@deployoor/hardhat": patch
---

Use viem's `Hex`/`Address` types, cap peer ranges below the next major, and remove the deprecated `force` option.

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
