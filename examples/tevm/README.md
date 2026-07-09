# example: tevm (plain Solidity) + deployoor

deployoor on a project with **just `.sol` files** — no Hardhat, no Foundry. `deployoor generate` compiles the sources with [tevm](https://tevm.sh)'s compiler and emits typed deployers: **generate → deploy → committed record**, plus a node-free test. Everything below actually runs.

```
src/Counter.sol                           the contract
        │  deployoor generate   (compiles with @tevm/compiler + solc)
        ▼
deployers/Counter.ts                      typed getOrDeployCounter (gitignored)
        │  scripts/deploy.ts
        ▼
deployments/<chainId>-<network>/Counter.json   the source of truth — committed to the repo
```

## 1. Generate (compiles for you)

`deployoor.config.ts` sets `framework: "tevm"` and `sources: "./src"`, so `deployoor generate` compiles every `.sol` under `src/` with tevm — no separate `hardhat compile`/`forge build` step. The compiler toolchain (`@tevm/compiler` + `solc`) is installed as a dev dependency (deployoor lists them as optional peers).

```bash
pnpm --filter @example/tevm exec deployoor generate
# deployoor: generated 3 file(s)
```

## 2. Deploy → record

`scripts/deploy.ts` uses the generated `getOrDeployCounter` with a real signer over a real RPC. First run deploys and writes a record; later runs return the recorded contract with no transaction (`freshDeploy` tells them apart).

```bash
cp .env.example .env            # RPC_URL + PRIVATE_KEY (defaults: local `anvil`)
anvil &                         # or point .env at a testnet
pnpm --filter @example/tevm deploy
```

## 3. Test — no node, no disk

The same generated `getOrDeployCounter` runs in a vitest test against an in-memory EVM (tevm, via [`@deployoor/testing`](../../packages/deployoor-testing)). Spreading `clients` passes the in-memory store, so tests never touch `deployments/`.

```bash
pnpm --filter @example/tevm e2e   # deployoor generate (compiles) → vitest
```

> Note: the tevm adapter targets standalone sources with the default compiler settings. Projects that need import remappings or linked libraries are better served by Foundry or Hardhat today.
