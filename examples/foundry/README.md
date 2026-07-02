# example: Foundry + deployoor

deployoor on a normal Foundry project. Foundry compiles; deployoor generates typed deployers from `out/`, and the test deploys to an in-memory EVM (via `@deployoor/testing`) — no node.

```bash
pnpm --filter @example/foundry e2e   # forge build → deployoor generate → vitest
```

- `src/Counter.sol` — the contract (Foundry compiles it to `out/`)
- `deployoor.config.ts` — deployoor auto-detects the Foundry project
- `deployoor generate` writes `deployers/` (one typed `getOrDeploy<Name>` per contract)
- `test/counter.test.ts` — `createTestClients()` (tevm) + the generated deployer

Requires the Foundry toolchain (`forge`) on your PATH.
