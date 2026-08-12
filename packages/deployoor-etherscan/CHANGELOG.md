# @deployoor/etherscan

## 0.3.1

### Patch Changes

- 6de8a8a: Fix two bugs that made live Etherscan verification fail — both found by a real Sepolia deploy

  Neither was reachable from a mock `fetch`, and both were shipped.

  **`chainid` was only in the POST body.** Etherscan V2 requires it as a query parameter, and rejects a body-only value:

  ```text
  Missing or unsupported chainid parameter (required for v2 api)
  ```

  So _every_ live verification failed at submit — deploy-time and `deployoor verify` alike. The status poll already put `chainid` on the URL, which is why only the submit broke. It is now on the URL for both, and kept in the body too, since Blockscout/Routescan endpoints reached via `apiUrl` read it from there.

  The test suite asserted every form field of that request and nothing about its URL, so a body-only `chainid` passed. It is asserted now.

  **Deploy-time verification lost a race with Etherscan's indexer.** Submitting straight after the receipt gets:

  ```text
  Unable to locate ContractCode at 0x…
  ```

  The chain is simply ahead of the explorer. That was a hard failure, so a fresh deploy's verification usually failed and had to be recovered with `deployoor verify` afterwards. The submit is now re-tried on that specific reply (bounded by `maxPolls`, the same budget the status poll uses), which is what hardhat-verify does. Observed live: six retries over about twelve seconds, then verified in the same run.

  `maxPolls` is also validated as a positive integer now. It bounds both recursions, so `0` skipped the status poll and reported a timeout on a verification that may have passed, and `NaN` — what `Number()` of an unset env var gives — failed every comparison and made the first attempt the last.

  Verified end to end on Sepolia — `Counter`, `Greeter` and `Vault` deployed with a Privy server wallet and confirmed verified through Etherscan's own `getsourcecode`.

## 0.3.0

### Minor Changes

- b81ed1e: Reject an empty `apiKey` / `webhook` when verification or notification starts, and stop the docs asserting the environment variable is set

  The examples everywhere showed `etherscan({ apiKey: process.env.ETHERSCAN_KEY! })`. The `!` only silences the type — at runtime an unset variable made `apikey: undefined` part of the request, so the failure arrived from the explorer as an authentication error at the end of a deploy, naming nothing you could act on. `@deployoor/slack` had the same shape with `webhook`.

  Both now check when the credential is actually needed — a verification starting, a notification about to be sent:

  ```text
  @deployoor/etherscan: apiKey is required and was empty. Etherscan V2 needs one key for every
  chain — set it in your environment (e.g. ETHERSCAN_KEY) and pass it as
  `etherscan({ apiKey: process.env.ETHERSCAN_KEY })`.
  ```

  At first use rather than at construction, deliberately: `deployoor.config.ts` is imported by _every_ command, so a construction-time throw made `deployoor generate` exit with an Etherscan credential error over a key it never uses. That is worse than the problem being fixed, since working locally without an explorer key is the normal case. The check still runs before the first request, so the failure stays local and still names the variable.

  `EtherscanOptions.apiKey` and `SlackOptions.webhook` are typed `string | undefined` so the env-var expression reads through without an assertion. Both keys stay **required**, so `etherscan({})` is still a compile error — the only thing now permitted is passing a value that might be missing, which is exactly the case the runtime check exists for.

  Also unifies the Slack environment variable across the docs: two examples and one README said `SLACK_HOOK` while the plugin's own docblock, the package README and the new error message all say `SLACK_WEBHOOK`.

- 5655eb2: Implement the new `onVerify` hook, so `deployoor verify` can verify recorded deployments after the
  fact — from the sources pinned beside each record, with no recompile.

  The submit-and-poll body is now one function that both hooks call, so deploy-time verification and
  after-the-fact verification cannot drift: they send the same standard-json request and read the same
  replies. `onContractDeployed` behaves exactly as before, including skipping when a deploy offers no
  compiler input.

  The `deployoor` peer range rises to `>=0.7.0 <1.0.0`, since `onVerify` and `VerifyContext` are
  what these now compile against.

## 0.2.1

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
