# example: Hardhat + deployoor

The full journey on a normal Hardhat (v2) project: **compile → generate → deploy → committed record → typed app access** — plus a node-free test. Everything below actually runs.

```
contracts/Counter.sol                     the contract
        │  hardhat compile  (@deployoor/hardhat auto-runs generate)
        ▼
deployers/Counter.ts                      typed getOrDeployCounter (generated, gitignored)
        │  scripts/deploy.ts
        ▼
deployments/31337-foundry/Counter.json    the source of truth — committed to the repo
        │  wagmi generate  (@deployoor/wagmi feeds @wagmi/cli)
        ▼
src/generated.ts                          typed app access — committed, so you can read it here
```

You can inspect every stage in this folder without running anything: the [record](deployments/31337-foundry/Counter.json) and the [generated app access](src/generated.ts) are both committed.

## 1. Compile → generate (one step)

`hardhat.config.js` loads [`@deployoor/hardhat`](../../packages/deployoor-hardhat), so a compile regenerates the typed deployers automatically — no separate `deployoor generate`:

```bash
npx hardhat compile
# deployoor: generated 3 deployer file(s)
```

## 2. Deploy → record

`scripts/deploy.ts` uses the generated `getOrDeployCounter` with a real signer over a real RPC. First run deploys and writes a record; later runs return the recorded contract with no transaction (`freshDeploy` tells them apart).

```bash
cp .env.example .env            # RPC_URL + PRIVATE_KEY (defaults: local `anvil`)
anvil &                         # or point .env at a testnet
pnpm --filter @example/hardhat deploy
# Deployed Counter at 0x… (tx 0x…)
```

That writes the committed source of truth:

```
deployments/
└─ 31337-foundry/
   └─ Counter.json     ← address, ABI, chainId, args, tx, compiler
```

(A local `anvil` is a throwaway chain, so its committed record is illustrative — re-running against a fresh anvil finds the old address; `reset({ publicClient })` or `force: true` redeploys. On a testnet the address persists, so the record stays valid across runs.)

## 3. Record → typed app access

The record is just JSON, so consuming it is a [`@wagmi/cli`](https://wagmi.sh/cli) plugin. [`wagmi.config.ts`](wagmi.config.ts) points [`@deployoor/wagmi`](../../packages/deployoor-wagmi) at the same `deployments/` folder `scripts/deploy.ts` wrote:

```bash
pnpm --filter @example/hardhat wagmi
```

That writes [`src/generated.ts`](src/generated.ts) — committed here so you can read the end of the journey without running anything:

```ts
// src/generated.ts (generated — do not edit)
export const counterAbi = [...] as const;

// the address came from your own deploy, keyed by chain — you never typed it
export const counterAddress = { 31337: "0x5FbDB2315678afecb367f032d93F642f64180aa3" } as const;

export const readCounterNumber = createReadContract({ abi: counterAbi, address: counterAddress, functionName: "number" });
export const writeCounterSetNumber = createWriteContract({ abi: counterAbi, address: counterAddress, functionName: "setNumber" });
```

Deploy to a second chain and `counterAddress` becomes a two-key map — same import, no branching in your app. Swap `actions()` for `react()` in `wagmi.config.ts` to get hooks instead (`useReadCounterNumber`). Nothing here imports deployoor: the generated file needs only `@wagmi/core` (or `wagmi` for hooks), so your app never depends on your deploy tool.

## Test — no node, no disk

The same generated `getOrDeployCounter` runs in a vitest test against an in-memory EVM ([tevm](https://tevm.sh), via [`@deployoor/testing`](../../packages/deployoor-testing)). Spreading `clients` passes the in-memory store, so tests never touch `deployments/`.

```bash
pnpm --filter @example/hardhat e2e   # hardhat compile → vitest → wagmi generate
```
