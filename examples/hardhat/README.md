# example: Hardhat + deployoor

deployoor on a normal Hardhat (v2) project. Hardhat compiles; deployoor generates typed deployers from `artifacts/`, and the test deploys to an in-memory EVM (via `@deployoor/testing`) — no node.

```bash
pnpm --filter @example/hardhat e2e   # hardhat compile → deployoor generate → vitest
```

- `contracts/Counter.sol` — the contract (Hardhat compiles it to `artifacts/`)
- `deployoor.config.ts` — deployoor auto-detects the Hardhat project
- `deployoor generate` writes `deployers/` (one typed `getOrDeploy<Name>` per contract)
- `test/counter.test.ts` — `createTestClients()` (tevm) + the generated deployer
