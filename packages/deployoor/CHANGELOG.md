# deployoor

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
