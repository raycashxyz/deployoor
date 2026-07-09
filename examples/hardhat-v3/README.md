# example: Hardhat 3 + deployoor

deployoor on a **Hardhat 3** project (ESM config, the new `hh3-artifact-1` layout): **compile → generate → deploy → committed record**, plus a node-free test. Everything below actually runs.

```
contracts/Counter.sol                     the contract
        │  hardhat compile   (Hardhat 3 → artifacts/ + build-info/<id>.json)
        ▼
deployers/Counter.ts                      typed getOrDeployCounter (deployoor generate, gitignored)
        │  scripts/deploy.ts
        ▼
deployments/<chainId>-<network>/Counter.json   the source of truth — committed to the repo
```

## 1. Compile → generate

Hardhat 3's plugin API differs from Hardhat 2, so the `@deployoor/hardhat` auto-generate plugin (HH2-only today) isn't used here — run `deployoor generate` explicitly after compiling. The same [`generate` reader](../../packages/deployoor) parses Hardhat 3 artifacts (it resolves each artifact's inline `buildInfoId` to `artifacts/build-info/<id>.json`).

```bash
pnpm --filter @example/hardhat-v3 exec hardhat compile
pnpm --filter @example/hardhat-v3 exec deployoor generate
# deployoor: generated 3 file(s)
```

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
pnpm --filter @example/hardhat-v3 e2e   # hardhat compile → deployoor generate → vitest
```
