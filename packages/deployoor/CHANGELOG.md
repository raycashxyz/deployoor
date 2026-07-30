# deployoor

## 0.6.0

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

- 1cb8250: Harden `redeploymentStrategy` and make the pinned verification sources content-addressed.

  - **A v1 record no longer redeploys on a comment-only recompile.** The v1 fallback compared raw creation bytecode, which carries the same trailing CBOR metadata hash as the runtime code — so upgrading deployoor and recompiling redeployed every existing contract on the first run under the new `'on-change'` default. Both sides are now metadata-stripped.
  - **Constructor args are compared by their ABI encoding**, not their JSON shape, so `1`, `1n`, and the `"1"` a record stores are one value. This is the canonicalisation `identityHash` already applied to the whole tuple, so the component diff and the hash now agree by construction. Both sides of a pair must encode for the encoded comparison to count: viem's address encoder accepts an all-lowercase address but rejects a non-checksummed mixed-case one, so encoding per value would compare an ABI key against a JSON key — two key spaces that can never be equal — and report a change that isn't one. Address casing is folded away by the shared JSON fallback.
  - **`stripMetadata` is total.** It parsed the trailing bytes as a length without checking they were hex, so bytecode ending in an unlinked `__$…$__` library placeholder threw — surfacing as an untagged defect from the diff path, which documents itself as non-throwing.
  - **Pinned verification sources are content-addressed**, at `deployments/sources/<hash>.json` with a `sourcesHash` on the record, replacing the per-record `<Name>.sources.json` sidecar. A standard-json input is the whole compilation unit, so the previous layout meant one copy of every source file per contract _per chain_; identical input is now stored once. `reset` collects blobs no remaining record references instead of deleting by name, so a blob another chain still points at survives. Pinning is best-effort: the deploy is already confirmed by then, so a store that cannot write sources logs a warning and the record is written without a `sourcesHash` rather than the whole call failing.

    Custom `StoreAdapter` implementations need updating: `writeSources(hash, sources)` and `readSources(hash)` are keyed by the content hash (typed `Hex`) rather than `(network, name)`, and `removeSources` is replaced by `pruneSources()`, which drops every blob no surviving record references.

  - **Records store a `codeHash`, not a second copy of the runtime bytecode.** Verification never reads it — a standard-json verify submits the pinned sources and the explorer recompiles — so the field is an artifact-side code identity, at 32 bytes instead of ~24KB of hex per contract per chain. It is `keccak` of the **metadata-stripped** runtime bytecode, so comparing it to on-chain code means stripping the trailing CBOR from `eth_getCode` first, and it will not match at all for a contract with `immutable` variables, whose deployed code has the values written in. It is omitted (rather than silently meaning something else) when the runtime bytecode still carries unlinked library placeholders, because viem's `keccak256` does not reject non-hex input — it falls through to hashing the text.
  - **`identityHash` is omitted rather than substituted** when the identity is not computable. It previously fell back to a bare code hash, which can never equal a real identity hash and so bought exactly one spurious redeploy; absent, the reuse test falls back to the component diff.
  - **`register` appends to history instead of replacing it.** Re-registering an external contract at a new address kept only the new entry and recorded no `supersededAddress`. Re-registering the _same_ address appends nothing, so a repeated script run no longer grows the log.

  Upgrading: existing `deployments/**/<Name>.sources.json` files are no longer read or written, and nothing backfills them — a record only gains a `sourcesHash` when it is next deployed. Keep the legacy files until the records beside them carry a `sourcesHash`; for a deployment you never redeploy, the old sidecar stays the only pinned copy of its sources.

- 1d04bfd: Add `redeploymentStrategy` and redeploy-on-change.

  `getOrDeploy` now decides reuse-vs-redeploy by a `redeploymentStrategy` — `'on-change'` (the new default), `'never'`, or `'always'` — settable per call, as a config default, or per chain via `redeploymentStrategyByChainId`. `'on-change'` redeploys when the **deploy identity** (metadata-stripped runtime bytecode + constructor args + linked library addresses) changes, so a redeployed dependency's new address cascades through the contracts that take it — while a comment-only recompile does not redeploy.

  Deployment records are now `schemaVersion: 2`: they carry a `codeHash`, an `identityHash`, and an append-only `history` of every (re)deploy with a descriptive `reason`/`summary` (v1 records still read, and upgrade in place on the next deploy). Each deploy also pins the exact solc standard-json input it used, so a deployment stays verifiable on a block explorer later — independent of the current source tree.

  BREAKING (pre-1.0): the default is now `'on-change'` rather than reuse-only, so a changed contract redeploys on re-run. Set `redeploymentStrategy: 'never'` (globally or per chain) to restore the old behaviour. The boolean `force` option is **removed**: replace `force: true` with `redeploymentStrategy: 'always'` and `force: false` with `redeploymentStrategy: 'never'`.

### Patch Changes

- d7acf57: Update the package description to lead with what deployoor is: deploy EVM contracts from TypeScript with your own viem wallet, where a deploy is an artifact plus a client so scripts, tests, and your app share the same typed contract objects. No code change.

## 0.5.0

### Minor Changes

- ecab8f9: Add Hardhat 3 and tevm support to `deployoor generate`.

  - **Hardhat 3**: the Hardhat reader now handles both majors, keyed on the artifact's build-info
    linkage — Hardhat 2's `<Name>.dbg.json` → build-info, and Hardhat 3's inline `buildInfoId` +
    split `build-info/<id>.json` (`hh3-sol-build-info-1`). The standard-json input and
    `solcLongVersion` used for verification are read the same way from both. Uses `inputSourceName`
    for the fully-qualified name when present so verification matches the compiled source path.
  - **tevm**: a new adapter compiles a project's `.sol` sources directly with `@tevm/compiler` + a
    solc-js instance — no Hardhat or Foundry project required. A plain-`.sol` project is
    auto-detected (no Foundry/Hardhat markers + `.sol` under `src/` or `contracts/`); set
    `framework: "tevm"` in `deployoor.config.ts` (or add a `tevm.config.*`) and `sources` only to be
    explicit or when contracts live elsewhere. `@tevm/compiler` and `solc` are optional peers,
    lazy-loaded only for tevm projects, so the core stays dependency-light.

  `generate` is now async internally (the tevm adapter compiles on demand); the `deployoor generate`
  CLI and the exported `generateDeployers` keep the same signatures — `generateDeployers` was already
  `async` and returned a `Promise`, so programmatic callers already `await` it. New config fields:
  `framework` and `sources`.

## 0.4.0

### Minor Changes

- 7913ff9: Point repository metadata at `raycashxyz/deployoor` after transferring the GitHub org.

## 0.3.0

### Minor Changes

- 7c4faa2: Generate deployers for library-linked contracts, record the library map, and let `register` run with only a public client.

  - `deployoor generate` no longer silently drops a contract whose bytecode carries solc's unlinked library placeholders (`__$…$__`). The artifact and deployment-record bytecode boundary now accepts placeholders via a new `Bytecode` validator (`Hex` stays strict for addresses and tx hashes), so a library-dependent contract gets a typed `getOrDeploy<Name>` — its addresses are linked at deploy time from the `libraries` call option, and the deployment record now also stores that `libraries` map.
  - `deployoor generate` warns when an explicit `include` name matches no deployable contract (a typo, or a contract that failed to compile) instead of dropping it silently.
  - `register(...)` no longer requires a `walletClient`: it only records an existing address, so a `publicClient` is enough. Pass a wallet to record it as the registrant and get a writable contract back; omit it and the deployer is recorded as the zero address (read-only contract).

## 0.2.0

### Minor Changes

- 2a34f70: Harden deployment records and test helpers: records now carry `schemaVersion: 1`, use chain-id-based filesystem keys, guard chainId mismatches on reuse, warn on stale bytecode/constructor args, and write filesystem records atomically under a lock. `@deployoor/testing` now exposes tevm, cheatcodes, fixtures, and deployment-record seeding (seeded records are remapped onto the in-memory chain so `getOrDeploy` reuses them). Verifier plugins can retry reused deployments when artifact metadata is available, Slack can notify failed deploys, and the wagmi plugin uses Zod 4-safe validators with ABI drift checks.

  **BREAKING (pre-1.0):** the record folder layout changed from `deployments/<chain name>/` to `deployments/<chainId>-<slug>/` (e.g. `deployments/sepolia/` → `deployments/11155111-sepolia/`), and the record's `networkName` field now holds that composite key. Records written by 0.1.x are not read from the old location — move each folder to its new name (and update `networkName` inside the files, or let the next deploy rewrite them) before re-running deploy scripts, or `getOrDeploy` will redeploy.

- 2a34f70: Expose `register` and `reset` as project-level entry points. `deployoor generate` now emits both in the deployers index (config-bound, scoped to the client's chain): `register({ walletClient, publicClient, deploymentName, address, abi })` records a contract you didn't deploy (e.g. USDC) with no transaction and returns its viem object, and `reset({ publicClient, deploymentName? })` forgets recorded deployment(s) so the next `getOrDeploy` redeploys. Adds the public factories `defineRegister` / `defineReset`. The older `name` spelling is accepted as a compatibility alias.

  Registered records are marked `kind: "external"`, and `register` will not overwrite a real deployment at the same `(chain, name)` — it fails with `DeploymentExists` (reset it first, or use a different name); re-registering an external record updates it. `reset` is a pure local-records operation and needs only a `publicClient` (no signer).

  Also documents `deploymentName` (defaults to the contract name) for deploying and tracking multiple instances of the same contract.

- c12b352: `getOrDeploy` and `register` now resolve to a `DeployResult` — `{ contract, deployment, freshDeploy, receipt? }` — instead of the bare viem contract. `contract` is the typed viem object (same one as before); `freshDeploy` is `true` only when the call broadcast a deploy transaction (so it is `false` on idempotent reuse and always for `register`); `receipt` is the deploy receipt, present only on a fresh deploy; `deployment` is the full record. This lets a deploy script run one-time setup only when it actually deployed.

  **BREAKING (pre-1.0):** callers that used the return value as a contract must destructure it — `const token = await getOrDeployToken(...)` becomes `const { contract: token } = await getOrDeployToken(...)`.

  Also adds the `deployoor/generate` subpath, exporting `generateDeployers({ root })` — the programmatic form of `deployoor generate` (discover config → read artifacts → write typed deployers) so a build tool can run generation in process. `@deployoor/hardhat` uses it.

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.

## 0.1.0

### Minor Changes

- 15fab66: Initial public release of deployoor: viem-first contract deployment with a `deployments/` source of truth, idempotent `getOrDeploy<Name>` deployers, the `deployoor/plugin` lifecycle SDK, and the `@deployoor/wagmi` / `@deployoor/etherscan` / `@deployoor/sourcify` / `@deployoor/slack` plugins.
