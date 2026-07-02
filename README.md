<div align="center">

# deployoor

**Deploy EVM contracts once. Use them everywhere as typed viem objects.**

Idempotent, typed deploys with a plain-JSON source of truth and a modular plugin model. Keep track of which contract is deployed on which chain, then consume those records from any viem app with zero lock-in. Works with Hardhat and Foundry.

</div>

---

## The problem

Deploying contracts to an EVM chain is solved. _Using_ them from your app is where it falls apart.

- **Addresses and ABIs get copy-pasted and go stale.** The address ends up in a deploy script, the ABI in some JSON file, and you paste both into your app by hand. Redeploy, and every copy silently drifts out of sync.
- **Provider/client wiring is manual boilerplate.** You re-thread the same client, address, and ABI into every contract, on every network.
- **There's no single source of truth** for what is deployed where — with which ABI, constructor args, tx hash, and compiler — across networks.
- **Deploy scripts aren't idempotent.** Re-running either redeploys or throws, when all you wanted was the contract you already deployed.
- **Tools couple your app to themselves.** You want deployment records and app-facing access that remain useful even if you drop the deploy tool later.

## The fix

deployoor makes a plain `deployments/` folder the single source of truth, and generates the wiring for you:

- Every deploy is recorded to `deployments/<chainId>-<network>/<Contract>.json` — address, ABI, chainId, args, tx, compiler. No copy-paste, no drift.
- Generated deployers inject the address and ABI for you. You add a client; nothing else.
- `getOrDeploy<Name>` is **idempotent and re-runnable**: the first call deploys and records; later calls return the existing deployment with no tx. It resolves to `{ contract, freshDeploy, receipt, deployment }`, so a deploy script can run one-time setup only when it actually deployed. `force: true` redeploys; `deploymentName` (default: the contract name) tracks multiple instances of one contract; `register(...)` records an external contract (e.g. USDC) and `reset(...)` forgets records — both with no tx.
- **Bring any signer, any RPC** — deployoor only ever sees a viem `WalletClient` + `PublicClient`, so a CI private key, an injected browser wallet, a Ledger, or a hosted wallet like Privy or Turnkey all work the same way. The library stays dependency-light; the signer and the RPC are whatever you hand it.
- **Zero lock-in** — the record is plain JSON, and the app-facing viem/wagmi output does not require deployoor at runtime. Keep the records in their own package, separate from your contracts, as the single source of truth for every network — and import them anywhere, even the browser.

The name is the crypto-degen `-oor` agent-noun of "deploy" (like buidloor / hodloor) — literally "the thing that deploys."

## How it works

deployoor reads your compiled artifacts, deploys idempotently, and records each deploy to `deployments/<chainId>-<network>/<Contract>.json` — a plain-JSON source of truth for every address, ABI, chain, constructor args, tx, and compiler setting.

That `deployments/` folder is the product: universally-portable vanilla JSON, committed to your repo, readable by humans and any tool — in any language, since it's just JSON (a Python, Go, or Rust service reads it just as easily). Keep it in its own package, separate from your contracts, as the single source of truth for every network — and import it anywhere, even the browser. The generated deployers already hand back fully-typed viem objects at deploy time; consuming the records elsewhere — a frontend, a backend, a script — needs nothing but `viem`. Want typed React hooks? The optional [`@deployoor/wagmi`](packages/deployoor-wagmi) plugin feeds [`@wagmi/cli`](https://wagmi.sh/cli) — one convenient consumer, not a required second half.

## Quickstart

```bash
pnpm add -D deployoor viem
npx deployoor init
forge build                    # or: npx hardhat compile
npx deployoor generate
```

```ts
// walletClient is any viem WalletClient — a local key, an injected wallet, or Privy/Turnkey.
// deploy once; every run after returns the same contract — no tx, just the recorded address.
// The result is { contract, freshDeploy, receipt, deployment } — freshDeploy is true only
// when this call actually deployed, so a script can gate one-time setup on it.
const { contract: token, freshDeploy } = await getOrDeployToken({
  walletClient,
  publicClient,
  args: [owner],
});
if (freshDeploy) await token.write.initialize([owner]); // one-time setup, only on a real deploy
await token.write.transfer([to, amount]);
```

Running it writes one record per contract — this is your committed source of truth:

```
deployments/
└─ 11155111-sepolia/
   └─ Token.json
```

```jsonc
// deployments/11155111-sepolia/Token.json
{
  "schemaVersion": 1,
  "contractName": "Token",
  "deploymentName": "Token", // defaults to contractName; set your own to track multiple instances
  "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "chainId": 11155111,
  "networkName": "11155111-sepolia",
  "abi": [/* the full ABI, exactly as deployed */],
  "bytecode": "0x60806040...",
  "constructorArgs": ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
  "transactionHash": "0x2c9a...d4e1",
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "deployedAt": 1719849600000,
  "compiler": {
    "version": "0.8.24+commit.e11b9ed9",
    "settings": { "optimizer": { "enabled": true, "runs": 200 } },
  },
  "kind": "standard",
}
```

Deploy more contracts, or to more networks, and you get `deployments/11155111-sepolia/Vault.json`, `deployments/8453-base/Token.json`, and so on — one file per (chain, contract). The folder key is the chain id plus a slugged chain name, so viem display names like "Arbitrum One" become filesystem-safe and cannot collide by name alone. That folder is what your app (or `@deployoor/wagmi`) reads. `bigint` args are stored as strings, so the file is plain, greppable JSON.

`deployoor generate` reads your artifacts and emits one typed `getOrDeploy<Name>` per contract. Config lives in `deployoor.config.ts`. Plugins are deploy-lifecycle hooks authored against the `deployoor/plugin` SDK.

Generated deployers are **TypeScript** (`.ts`). The CLI and config work in JS projects, but you need `tsx`, Bun, or vitest to run deploy scripts that import them — bare `node` won't load `.ts` without a runner.

> **Using an AI agent?** [`skills/deployoor-integration`](skills/deployoor-integration/SKILL.md) is a SKILL an LLM can follow to wire deployoor into a project end-to-end.

## Testing

The generated deployers are just functions that take viem clients, so a test deploys exactly like production. [`@deployoor/testing`](packages/deployoor-testing)'s `createTestClients()` boots an in-memory EVM ([tevm](https://tevm.sh)) as viem clients **and an in-memory store** — no Hardhat test environment, no local node, and deploys never touch disk. Use any runner (vitest, `node:test`).

```ts
// token.test.ts — a smart-contract test in vitest. No Hardhat, no local node.
import { test, expect } from "vitest";
import { createTestClients } from "@deployoor/testing";
import { getOrDeployToken } from "../deployers";

test("transfer moves the balance", async () => {
  const clients = await createTestClients(); // a real EVM in-process + an in-memory store
  const [deployer, bob] = clients.accounts; // prefunded accounts

  // the SAME getOrDeploy you run in production — spread `clients` and it deploys to memory
  const { contract: token } = await getOrDeployToken({ ...clients, args: [deployer.address] });

  await token.write.transfer([bob.address, 1000n]);
  expect(await token.read.balanceOf([bob.address])).toBe(1000n);
});
```

Same `getOrDeployToken` you ship — here it targets a throwaway in-process chain and an in-memory store, so each run is clean and nothing is written to `deployments/`. Multiple parties? `clients.walletClientFor(account)`. Want a real node instead? Build the clients against a local anvil or a fork; nothing else changes.

## Compatibility

- **Node.js:** Core `deployoor` and all plugins target **Node ≥ 18**. [`@deployoor/testing`](packages/deployoor-testing) and [`fhevm-tevm-mocks`](packages/fhevm-tevm-mocks) require **Node ≥ 20** because tevm's CJS build pulls in ESM-only dependencies that only work under `require()` on Node ≥ 20.19 (the ESM path works on Node 18).
- **TypeScript-first:** The CLI and `deployoor.config.ts` work in any project (jiti loads the config), but **`deployoor generate` emits TypeScript deployers** (`.ts`). Plain JavaScript projects should run deploy scripts with `tsx`, Bun, or vitest — not bare `node`.
- **CJS vs ESM:** All packages ship dual CJS/ESM builds. Prefer ESM on Node 18 if you hit `ERR_REQUIRE_ESM` from tevm-dependent packages.

## Packages

| Package                                                | Description                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`deployoor`](packages/deployoor)                      | The deploy engine + codegen + CLI (`deployoor generate` / `deployoor init`). Reads Hardhat/Foundry artifacts, emits typed deployers, records each deploy to `deployments/`. |
| [`@deployoor/wagmi`](packages/deployoor-wagmi)         | A [`@wagmi/cli`](https://wagmi.sh/cli) plugin sourcing contracts from `deployments/` — typed contract objects for your app.                                                 |
| [`@deployoor/hardhat`](packages/deployoor-hardhat)     | Hardhat plugin — regenerate the typed deployers automatically after every `hardhat compile` (no separate `deployoor generate`).                                             |
| [`@deployoor/etherscan`](packages/deployoor-etherscan) | Verify on Etherscan V2 (one key, all chains; also Blockscout/Routescan).                                                                                                    |
| [`@deployoor/sourcify`](packages/deployoor-sourcify)   | Verify on Sourcify (v2, keyless).                                                                                                                                           |
| [`@deployoor/slack`](packages/deployoor-slack)         | Notify a Slack channel on each deploy.                                                                                                                                      |
| [`@deployoor/testing`](packages/deployoor-testing)     | `createTestClients()` — an in-memory EVM (tevm) as viem clients + an in-memory store, to test deploys with no local node.                                                   |
| [`fhevm-tevm-mocks`](packages/fhevm-tevm-mocks)        | Tevm-native adapter for Zama FHEVM mock tests — you own the Tevm instance; this package wires FHE host contracts and relayer handlers.                                      |

Plugins are deploy-lifecycle hooks; each ships as its own package and depends only on `deployoor/plugin`.

## Development

This is a pnpm + Turborepo monorepo.

```bash
pnpm install      # install everything
pnpm build        # build all packages (turbo)
pnpm test         # run all tests
pnpm typecheck    # typecheck all packages
pnpm lint         # oxlint
pnpm format       # prettier --write
```

Releases are managed with [Changesets](https://github.com/changesets/changesets): add one with `pnpm changeset`; merging the auto-opened "Version Packages" PR publishes to npm with provenance.

## Status

Early. The deploy core, the plugin model, and the wagmi bridge are stabilizing. Foundry and Hardhat v2 are supported today; Hardhat v3 support is a priority compatibility item.

Pre-1.0, minor releases may include breaking API changes. Deployment records carry `schemaVersion: 1`; record-format changes will be versioned and documented because committed JSON is the portability boundary.

## Roadmap

Grouped **done → planned → backlog**. _Planned_ is the committed near-term focus; _backlog_ is on the radar and feedback-driven — open an issue to pull something forward.

| Area    | What                                                                           | Status  |
| ------- | ------------------------------------------------------------------------------ | ------- |
| Compat  | Foundry + Hardhat v2 artifacts                                                 | Done    |
| Deploy  | Idempotent `getOrDeploy`, `register` / `reset`, stale-reuse warning            | Done    |
| Deploy  | Atomic record writes, deploy lock, chainId record identity + mismatch guard    | Done    |
| Stores  | Pluggable `StoreAdapter` + in-memory store                                     | Done    |
| Verify  | Etherscan V2 + Sourcify                                                        | Done    |
| Testing | `@deployoor/testing` (tevm clients + in-memory store)                          | Done    |
| DX      | `@deployoor/wagmi` bridge, plugin SDK + Slack, Hardhat/Foundry examples        | Done    |
| Deploy  | Richer `getOrDeploy` return (`{ contract, freshDeploy, receipt, deployment }`) | Done    |
| DX      | `@deployoor/hardhat` — auto-generate deployers on `hardhat compile`            | Done    |
| DX      | Flagship end-to-end example (deploy → committed record → wagmi)                | Done    |
| Compat  | Hardhat v3 support                                                             | Planned |
| Verify  | `deployoor verify` from committed records                                      | Planned |
| Deploy  | Bytecode-diff redeploy (opt-in policy; today it only warns)                    | Planned |
| DX      | Migration guide + comparison table (hardhat-deploy, Ignition, rocketh)         | Planned |
| Deploy  | Proxies & diamonds, deterministic addresses (CREATE2 / CREATE3), dry run       | Backlog |
| Deploy  | Pending-transaction recovery from interrupted deploys                          | Backlog |
| Stores  | HTTP + browser store adapters                                                  | Backlog |
| Verify  | More explorers (Blockscout-native, OKLink, custom endpoints)                   | Backlog |
| DX      | `--watch`, `deployoor list` / `status`, import records, standalone scaffold    | Backlog |
| Plugins | `onGenerated` hook, gas report, Tenderly, Discord, IPFS, Safe                  | Backlog |
| AI      | Upgrade-safety diff, deployments MCP, deploy-script scaffolding (separate pkg) | Backlog |

Full detail and rationale in [TODO.md](TODO.md).

## License

[MIT](LICENSE) © Valerio Leo
