# Multi-chain example (Ping / Pong + LayerZero)

Deploy **Ping** on Sepolia and **Pong** on Base Sepolia from a **single TypeScript script** — each `getOrDeploy` call takes its own viem `walletClient` / `publicClient` pair. deployoor records each contract under the matching `deployments/<chainId>-<network>/` folder.

## Setup

```bash
pnpm install
cp .env.example .env   # fund the key on Sepolia + Base Sepolia
pnpm --filter @example/multi-chain generate
```

## Deploy both chains

```bash
pnpm --filter @example/multi-chain deploy
```

The script:

1. Builds Sepolia and Base Sepolia viem clients from two RPC URLs
2. `getOrDeployPing` on Sepolia, `getOrDeployPong` on Base Sepolia (idempotent)
3. Calls `setPeer` on each contract so LayerZero knows the remote address

See [`scripts/deploy.ts`](scripts/deploy.ts) for the full flow.

## Contracts

| Contract | Chain        | Role                                       |
| -------- | ------------ | ------------------------------------------ |
| `Ping`   | Sepolia      | Sends cross-chain messages via LZ endpoint |
| `Pong`   | Base Sepolia | Receives pings (OApp `_lzReceive` in prod) |

Production apps extend [LayerZero OApp](https://docs.layerzero.network/v2/developers/evm/oapp/overview); this example keeps the deploy + peering story small.
