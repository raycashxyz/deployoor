# example: Hardhat + deployoor (end-to-end)

The full deployoor journey on a normal Hardhat (v2) project — **compile → generate → deploy → record → consume** — plus a node-free test. This is the flagship example: everything below actually runs.

```
contracts/Counter.sol                     the contract
        │  hardhat compile  (@deployoor/hardhat auto-runs generate)
        ▼
deployers/Counter.ts                      typed getOrDeployCounter (generated, gitignored)
        │  scripts/deploy.ts
        ▼
deployments/31337-foundry/Counter.json    the source of truth — committed to the repo
        │  wagmi generate  (@deployoor/wagmi)
        ▼
src/generated.ts                          typed ABIs + per-chain addresses for your app
```

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

## 3. Consume with wagmi (optional)

`wagmi.config.ts` sources the committed `deployments/` via [`@deployoor/wagmi`](../../packages/deployoor-wagmi):

```bash
pnpm --filter @example/hardhat wagmi:generate
```

`src/generated.ts` now exports typed access — no address pasted anywhere:

```ts
import { getContract } from "viem";
import { counterAbi, counterAddress } from "./generated";

const counter = getContract({ abi: counterAbi, address: counterAddress[31337], client });
await counter.read.number();
```

Consuming the records needs only `viem`; wagmi is one convenient consumer.

## Test — no node, no disk

The same generated `getOrDeployCounter` runs in a vitest test against an in-memory EVM ([tevm](https://tevm.sh), via [`@deployoor/testing`](../../packages/deployoor-testing)). Spreading `clients` passes the in-memory store, so tests never touch `deployments/`.

```bash
pnpm --filter @example/hardhat e2e   # hardhat compile → (auto-generate) → vitest
```
