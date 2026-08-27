# @deployoor/testing

## 0.5.0

### Minor Changes

- 915141e: Writes on a deployed contract no longer need an explicit `{ account, chain }`.

  `DeployResult.contract` was typed against a bare `WalletClient`, whose `chain` and `account` are both `Chain | undefined` / `Account | undefined`. viem makes the second argument of a write mandatory whenever either could be `undefined`, so `contract.write.foo(args)` demanded `{ account, chain }` even though the deployer had already bound both. The contract type now names the shape the engine actually runs on (`clientsLayer` fails with `NoChainOnClient` without a chain and an account), so a single-argument write typechecks:

  ```ts
  const { contract } = await getOrDeployCounter({ walletClient, publicClient, args: [1n, owner] });
  await contract.write.increment(); // was: increment({ account, chain })
  ```

  Passing the options explicitly still works, so existing scripts keep compiling.

  `register` now resolves to a contract that matches the client it was handed. It broadcasts nothing, so it accepts clients a deploy would reject, and each gets the write surface it can actually use: a wallet client with an account and a chain writes with no second argument; one binding neither still has `write` but must pass `{ account, chain }`; a public client alone gets no `write` at all. Previously every case was typed writable-and-bound, so `register({ publicClient })` followed by `contract.write.foo(...)` typechecked and then threw.

  `@deployoor/testing`'s clients are typed as bound (they always were, at runtime), so `contract.write.foo(args)` works single-argument in tests too. `TestWalletClient` is exported for annotating helpers.

  New exported types on `deployoor`: `BoundWalletClient`, `DeployedContract`, `UnboundContract`, `ReadOnlyContract`, and `Register`. `DeployResult` takes an optional second type parameter for the contract type, defaulting to the writable one.

## 0.4.0

### Minor Changes

- 5b5e8d2: Replace tevm with EDR as the in-memory EVM. `createTestClients()` keeps its zero-config shape and generated deployers work unchanged, but the engine underneath is now [EDR](https://github.com/NomicFoundation/edr), the Rust EVM behind Hardhat 3.

  Why: `tevm` could not be installed. It declares its ~40 sibling `@tevm/*` packages with caret ranges that float into a newer prerelease line, so `yarn add tevm` aborts on an unpublished `@evmts/zevm` platform package, and `npm i tevm` installs a mixed tree that throws `'@tevm/errors' does not provide an export named 'NoSignerAvailableError'` on import. That was inherited by anyone installing this package. `yarn add @deployoor/testing` now works with no `resolutions` block.

  The test suite also got a lot faster: deployoor's own 255-test suite went from ~7.6s to ~1.7s.

  **Breaking changes:**

  - `clients.tevm` is now `clients.provider`, an EIP-1193 handle. Every `hardhat_*` / `evm_*` method is reachable through `provider.request(...)`.
  - `cheatcodes.dumpState()` / `loadState(state)` are now `cheatcodes.snapshot()` / `revert(id)`. `revert` consumes its id, so restoring the same point twice needs two snapshots — `createFixture` handles this for you.
  - `cheatcodes.deal` is removed. Its ERC20 path required guessing which storage slot holds the balance mapping, which breaks on proxies, packed slots and rebasing tokens. Use `setBalance` for native ETH; mint or transfer for tokens, or reach for `hardhat_setStorageAt` through `provider` where you know your token's layout.
  - Options are no longer a tevm passthrough: `{ fork: { url, blockNumber, cacheDir }, chainId, blockGasLimit, autoMine }`. `fork` takes a URL string, not a viem transport.
  - The in-memory chain is named `edr-devnet` instead of `tevm-devnet`, which changes the key of seeded in-memory records.
  - **Requires Node ≥ 22**, which is what EDR declares.

## 0.3.1

### Patch Changes

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
