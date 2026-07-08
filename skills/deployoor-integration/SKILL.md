---
name: deployoor-integration
description: Integrate deployoor into a Hardhat or Foundry project to deploy EVM smart contracts and consume them as typed viem objects in your apps or tests. Use when the user wants to deploy contracts, write or fix a deploy script, stop copy-pasting addresses/ABIs, make deploys idempotent, verify contracts, or wire deployed contracts into a frontend with wagmi/viem.
license: MIT
---

# Integrating deployoor

deployoor is a viem-first deploy tool (like `@wagmi/cli` or Prisma): you run it to deploy once, keep a plain JSON record of which contract is deployed on which chain, and feed that record into viem/wagmi app access. It turns compiled artifacts into one typed `getOrDeploy<Name>` function per contract and records each deploy to a plain-JSON `deployments/` folder.

Mental model: **artifacts → `deployoor generate` → typed `getOrDeploy<Name>` → `deployments/<chainId>-<network>/<Contract>.json` → typed viem/wagmi access.**

## Prerequisites

- A project that compiles Solidity to artifacts: **Hardhat** (`artifacts/`) or **Foundry** (`out/` + `out/build-info`). deployoor auto-detects which. Compile first (`npx hardhat compile` or `forge build`).
- Node 18+. Run TypeScript deploy scripts with `tsx`.

## Step 1 — Install

```bash
pnpm add -D deployoor viem tsx
# optional verification / notification plugins:
pnpm add -D @deployoor/etherscan @deployoor/sourcify @deployoor/slack
# optional typed frontend access:
pnpm add -D @wagmi/cli @deployoor/wagmi
```

`viem` is a peer dependency. deployoor reads the right artifacts for your toolchain automatically.

## Step 2 — Scaffold and edit the config

```bash
npx deployoor init   # writes deployoor.config.ts
```

```ts
// deployoor.config.ts — every field is optional
import { defineConfig } from "deployoor";
import { etherscan } from "@deployoor/etherscan";

export default defineConfig({
  include: ["Token", "Vault"], // default: every contract that has bytecode
  out: "./deployers", // where generated deployers are written (default)
  deploymentsPath: "./deployments", // where records are written/read (default)
  plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY! })], // optional
  onPluginError: "warn", // "warn" (default) keeps the run going; "throw" fails it
});
```

## Step 3 — Generate the deployers

```bash
npx hardhat compile      # or: forge build
npx deployoor generate
```

This writes `./deployers`: one `getOrDeploy<Name>` per deployable contract plus the typed artifacts. Deploy-time modules import deployoor; committed records and downstream viem/wagmi app output stay portable.

## Step 4 — Write a deploy script

A plain TypeScript script driven by two viem clients. `walletClient` is the signer — **any** viem `WalletClient` works (a local private key, an injected wallet, a Ledger, or a hosted wallet like Privy/Turnkey). `publicClient` is your RPC.

```ts
// scripts/deploy.ts
import { createWalletClient, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getOrDeployToken, getOrDeployVault } from "../deployers";

const account = privateKeyToAccount(process.env.PK as `0x${string}`);
const transport = http(process.env.RPC_URL);
const clients = {
  walletClient: createWalletClient({ account, chain: sepolia, transport }),
  publicClient: createPublicClient({ chain: sepolia, transport }),
};

// getOrDeploy resolves to { contract, freshDeploy, receipt, deployment } — use result.contract to read/write, and freshDeploy to run one-time setup only when this call actually deployed.
const { contract: token } = await getOrDeployToken({ ...clients, args: [account.address] });
const { contract: vault } = await getOrDeployVault({ ...clients, args: [token.address] });

console.log("token:", token.address);
await token.write.transfer([recipient, 1000n]);
```

```bash
tsx scripts/deploy.ts
```

Constructor args are type-checked against each contract's ABI. The deploy script needs **no** Hardhat/Foundry runtime — just the two viem clients.

## Idempotency

- First run deploys and records to `deployments/<chainId>-<network>/<Contract>.json`. Later runs return the existing contract with **no transaction** — so a deploy script is safe to re-run.
- `getOrDeploy<Name>` always resolves to `{ contract, freshDeploy, receipt, deployment }`, so callers never branch on "did it already exist" to read/write — reach for `result.contract` either way, and check `freshDeploy` when you need to run one-time setup only on the call that actually deployed.
- Redeploy on purpose: `await getOrDeployToken({ ...clients, args, force: true })`.
- Note: a recorded deployment is currently reused even if the contract code changed — use `force` to redeploy. (Automatic bytecode-change detection is on the roadmap.)

## Multiple instances of one contract

Pass `deploymentName` (defaults to the contract name) to deploy and track several instances of the same artifact independently:

```ts
const { contract: usdcVault } = await getOrDeployVault({
  ...clients,
  args: [usdc],
  deploymentName: "Vault_USDC",
});
const { contract: daiVault } = await getOrDeployVault({
  ...clients,
  args: [dai],
  deploymentName: "Vault_DAI",
});
```

Each gets its own record (`deployments/<chainId>-<network>/Vault_USDC.json`, …) and its own idempotency.

## Register an existing contract, or reset

`deployoor generate` also emits `register` and `reset` in the deployers index. Use `register` to record a contract you did **not** deploy (e.g. USDC) into the address book — no transaction — and `reset` to forget records on the client's chain:

```ts
import { register, reset } from "../deployers";

// register won't overwrite a real deployment at the same name — reset it first, or use a different name.
const { contract: usdc } = await register({
  ...clients,
  deploymentName: "USDC",
  address: "0x...",
  abi: usdcAbi,
});

// reset only forgets local records, so it needs just a public client (no signer):
await reset({ publicClient, deploymentName: "Token" }); // omit `deploymentName` to forget all on this chain — next getOrDeploy redeploys
```

## Verification & notifications (plugins)

Plugins are deploy-lifecycle hooks configured in `deployoor.config.ts`; they run on a fresh deploy (a reused deployment carries no compiler metadata to verify). Skip one for a single contract with a per-deploy override:

```ts
await getOrDeployVault({ ...clients, args: [token.address], plugins: { etherscan: false } });
```

Maintained plugins: `@deployoor/etherscan` (Etherscan V2 — one key works across every chain; point `apiUrl` at Blockscout/Routescan), `@deployoor/sourcify` (keyless), `@deployoor/slack`.

## Step 5 — Consume the contracts in a frontend (typed viem/wagmi)

`deployments/` is a documented JSON format, so consuming it is a `@wagmi/cli` plugin:

```ts
// wagmi.config.ts
import { defineConfig } from "@wagmi/cli";
import { actions } from "@wagmi/cli/plugins"; // or `react` for hooks
import { deployments } from "@deployoor/wagmi";

export default defineConfig({
  out: "src/generated.ts",
  plugins: [deployments({ path: "./deployments" }), actions()],
});
```

```bash
npx wagmi generate
```

This emits ABIs as `const`, per-chain address maps (the same contract across chains becomes one entry keyed by `chainId`), and typed actions/hooks. The generated `src/generated.ts` depends only on `viem` (plus `wagmi` if you use `react()`) — not on deployoor.

## Writing a custom plugin

A plugin is a small named object with lifecycle hooks, authored against `deployoor/plugin`:

```ts
import { definePlugin } from "deployoor/plugin";

export const discord = (o: { webhook: string }) =>
  definePlugin({
    name: "discord",
    onContractDeployed: async (ctx, { fetch }) => {
      if (ctx.reused) return; // no transaction happened on a reuse
      await fetch(o.webhook, {
        method: "POST",
        body: JSON.stringify({
          content: `${ctx.deployment.contractName} → ${ctx.deployment.address} on ${ctx.deployment.networkName}`,
        }),
      });
    },
  });
```

Each plugin is its own package, peer-depends on `deployoor`, and imports only from `deployoor/plugin`. The injected deps (`{ fetch, now, log }`) keep plugins testable.

## Error handling

deployoor's public API is Promise-only. On failure it rejects with a **tagged error** — match on `error._tag`:

`DeploymentFailed`, `LibrariesUnlinked`, `ArtifactsNotFound`, `NoChainOnClient`, `InvalidDeploymentRecord`, `PluginFailed`.

## Conventions & gotchas

- **Commit the `deployments/` folder** — it's the source of truth that humans, the frontend, and other tools read. It can live as its own package, separate from your contracts.
- **Re-run `deployoor generate`** after changing a contract's interface, so the typed deployer and ABI stay in sync.
- **The deploy step is framework-free.** Generated deployers need only `viem` + deployoor; nothing pulls in the Hardhat/Foundry runtime.

## Quick reference

```bash
npx deployoor init       # scaffold deployoor.config.ts
npx hardhat compile      # or: forge build
npx deployoor generate   # emit ./deployers
tsx scripts/deploy.ts    # run your deploy script
npx wagmi generate       # (optional) typed frontend access from deployments/
```

## Add a smoke test

Use `@deployoor/testing` so the same generated deployer runs against an in-memory EVM:

```ts
import { describe, expect, it } from "vitest";
import { createTestClients } from "@deployoor/testing";
import { getOrDeployToken } from "../deployers";

describe("Token deploy", () => {
  it("deploys in memory", async () => {
    const clients = await createTestClients();
    const { contract: token } = await getOrDeployToken({ ...clients, args: [clients.account.address] });

    expect(token.address).toMatch(/^0x/);
  });
});
```

Always spread `clients` or pass `store: clients.store`; otherwise a test can fall back to the filesystem store. If the config has notifier/verifier plugins, disable them per deploy with overrides such as `plugins: { slack: false, etherscan: false }`.
