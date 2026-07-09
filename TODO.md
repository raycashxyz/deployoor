# Roadmap

deployoor is early. This is where it's heading, grouped by area. Have a use case or want something sooner? Open an issue — priorities follow real needs.

**Status key:** **In progress** (actively being built) · **Planned** (committed, near-term) · **Exploring** (likely; shaping the design) · **Considering** (on the radar, feedback welcome).

## Compatibility

- **Hardhat v2 and v3** — _Done._ `deployoor generate` reads both Hardhat majors (v2's `.dbg.json` → build-info and v3's inline `buildInfoId` + split `build-info/<id>.json`) alongside Foundry `out/`. The `@deployoor/hardhat` auto-generate plugin supports both too, via two entry points in one package: `@deployoor/hardhat` (v2, side-effect registration) and `@deployoor/hardhat/v3` (v3, a `plugins: []` object that overrides the `compile` task). See `examples/hardhat` and `examples/hardhat-v3`.
- **tevm (`generate`)** — _Done._ `deployoor generate` can compile a plain-Solidity project (no Hardhat/Foundry) directly with tevm's compiler (`@tevm/compiler` + `solc`, optional peers) when `framework: "tevm"` is set or a `tevm.config.*` is present. See `examples/tevm`. Not yet exposed: remappings/libs config passthrough and a pinned/remote solc selector.

## Deploy engine

- **Detect bytecode changes** — _Planned._ Today a recorded deployment is reused until you pass `force`. An opt-in mode will notice when a contract's compiled bytecode has actually changed (ignoring metadata-only diffs) and redeploy, warn, or error per a policy you choose. Record-existence stays the default, so there's no surprise address churn from an unrelated edit.
- **Pending transaction recovery** — _Planned._ Filesystem writes are atomic and filesystem deploys take a coarse lock today, but a crash after broadcasting and before a receipt still needs a recoverable pending-tx sidecar/record so the next run can wait for or inspect the transaction instead of leaving recovery to the user.
- **Proxies & diamonds** — _Planned._ Upgradeable contracts: ERC1967 / Transparent / UUPS / ERC173 proxies and EIP-2535 diamonds, with implementation and facet history kept in the deployment record.
- **Deterministic addresses (CREATE2 / CREATE3)** — _Exploring._ The same address on every chain, plus address prediction before you broadcast.
- **Dry run** — _Exploring._ Simulate a deploy — predicted address and gas — without sending a transaction.
- **`getOrDeploy` return value** — _Done (0.2.0)._ Resolves to `{ contract, freshDeploy, receipt?, deployment }` so deploy scripts can gate one-time setup on `freshDeploy`.

## Testing

- **`@deployoor/testing` (tevm)** — _Done._ Run the same generated `getOrDeploy` functions against an in-memory EVM ([tevm](https://tevm.sh)) — no Hardhat network, no anvil, no disk writes. Spread `createTestClients()` and your deploy script code is your test code.
- **First-class tevm targets** — _Planned._ Extend beyond in-memory: forked mainnet state, snapshot fixtures, and CI-friendly tevm configs as supported deploy/test targets (building on what `@deployoor/testing` already proves today).

- **Pluggable store adapters** — _Planned._ Choose where the deployment record lives: filesystem (default), in-memory, or a remote HTTP API. The adapter interface already exists internally; this makes it selectable from `deployoor.config.ts`.
- **Browser deploys** — _Exploring._ With an in-memory store, run `getOrDeploy` client-side — deploy from a web app, not just read deployments into one.

> **Design note.** The store stays a swappable core service rather than a lifecycle hook, because it's read _before_ a deploy to decide whether to reuse or deploy. Mirroring records to an external system is a plugin concern (the same shape as the Slack notifier), so the two stay separate.

## Verification

- **Verify existing records** — _Planned._ Reused deployments now carry artifact metadata to plugins so verifiers can retry when possible. A dedicated `deployoor verify` command should re-read committed records and artifacts so a transient explorer outage never requires `force: true`.
- **More explorers** — _Exploring._ Beyond Etherscan V2 (one key, all chains) and Sourcify: Blockscout-native, OKLink, and custom per-chain endpoints, with verification status recorded alongside the deployment.

## CLI & developer experience

- **Watch mode** — _Considering._ `deployoor generate --watch` to regenerate deployers as artifacts change.
- **Inspect commands** — _Considering._ `deployoor list` / `deployoor status` to see what's deployed across networks at a glance.
- **Standalone-package scaffold** — _Considering._ Scaffold the `deployments/` + typed-access package outside your contracts, as a single source of truth importable anywhere (backend, frontend, browser).
- **Import existing deployments** — _Planned._ Bring in records from Foundry broadcasts, hardhat-deploy, or Hardhat Ignition, preserving enough compiler metadata for verification retries where the source artifacts are available.
- **Migration guide** — _In progress._ "Migrate from hardhat-deploy in 10 minutes" with an honest comparison table that includes Hardhat Ignition, Foundry broadcasts, and rocketh.
- **End-to-end example** — _In progress._ A runnable journey with `scripts/deploy.ts`, `.env.example`, a committed deployment record, and wagmi consumption so users can inspect deploy → JSON → frontend access in one place.
- **Docs site** — _In progress._ Minimal [vocs](https://vocs.dev) v2 site at `apps/docs` ([deployoor.dev](https://deployoor.dev) when deployed).
- **Community surface** — _Planned._ Enable GitHub Discussions and add issue templates / CONTRIBUTING once the hardening + testing docs land.
- **Terminal demo** — _Planned._ A short generate → deploy → record appears demo for the README.

## Plugins

- **More lifecycle hooks & plugins** — _Exploring._ An `onGenerated` hook (e.g. write an `.env` / address book), gas & cost reports, Tenderly verification, Discord notifications, IPFS source pinning, and Safe / multisig proposals. Each ships as its own package against the `deployoor/plugin` SDK.

## AI (opt-in, in a separate package — never in core)

The core stays deterministic and dependency-light. AI is additive.

- **Upgrade-safety review** — _Considering._ Before a redeploy or upgrade, summarize what changed — bytecode, constructor args, and storage-layout compatibility for proxies/diamonds — and flag risky changes.
- **Deployments MCP server** — _Considering._ Expose the `deployments/` folder to AI agents so they can answer "what's deployed on Base, and when?" and trigger deploys.
- **Deploy-script scaffolding** — _Considering._ Turn an intent like "deploy Token, then Vault(token), make Vault a minter" into the `getOrDeploy` sequence with constructor args wired.
