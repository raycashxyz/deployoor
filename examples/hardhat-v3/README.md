# example: Hardhat 3 + deployoor

deployoor on a **Hardhat 3** project (ESM config, the new `hh3-artifact-1` layout): **compile → generate → deploy → committed record**, plus a node-free test. Everything below actually runs.

```
contracts/Counter.sol                     the contract
        │  hardhat compile   (Hardhat 3 → artifacts/ + build-info/<id>.json)
        │  → @deployoor/hardhat/v3 plugin runs generate
        ▼
deployers/Counter.ts                      typed getOrDeployCounter (generated, gitignored)
        │  scripts/deploy.ts
        ▼
deployments/<chainId>-<network>/Counter.json   the source of truth — committed to the repo
```

## 1. Compile → generate

`hardhat.config.ts` registers the [`@deployoor/hardhat/v3`](../../packages/deployoor-hardhat) plugin in `plugins: []` (Hardhat 3's declarative plugin model — the Hardhat 2 entry registers by side effect instead). It overrides the `compile` task to run `deployoor generate` afterward, so one command does both:

```bash
pnpm --filter @example/hardhat-v3 exec hardhat compile
# Compiled 1 Solidity file with solc 0.8.28
# deployoor: generated 3 deployer file(s)
```

The reader parses Hardhat 3 artifacts by resolving each artifact's inline `buildInfoId` to `artifacts/build-info/<id>.json`. (No plugin? `deployoor generate` after `hardhat compile` works the same way.)

## 2. Deploy → record

`scripts/deploy.ts` uses the generated `getOrDeployCounter` with a real signer over a real RPC. First run deploys and writes a record; later runs return the recorded contract with no transaction (`freshDeploy` tells them apart).

```bash
cp .env.example .env            # RPC_URL + PRIVATE_KEY (defaults: local `anvil`)
anvil &                         # or point .env at a testnet
pnpm --filter @example/hardhat-v3 deploy
```

## 3. Test — no node, no disk

The same generated `getOrDeployCounter` runs in a vitest test against an in-memory EVM ([tevm](https://tevm.sh), via [`@deployoor/testing`](../../packages/deployoor-testing)). Spreading `clients` passes the in-memory store, so tests never touch `deployments/`.

```bash
pnpm --filter @example/hardhat-v3 e2e   # hardhat compile (plugin generates) → vitest
```
