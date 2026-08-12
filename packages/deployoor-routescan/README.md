# @deployoor/routescan

Verify contracts on [Routescan](https://routescan.io) — the explorer behind Snowtrace and many
Avalanche, Base and L2 chains — at deploy time, or after the fact with `deployoor verify`.

```bash
npm i -D @deployoor/routescan
```

```ts
// deployoor.config.ts
import { defineConfig } from "deployoor";
import { routescan } from "@deployoor/routescan";

// mainnet vs testnet comes from the chain id; nothing to configure for a chain viem knows.
export default defineConfig({
  plugins: [routescan({ apiKey: process.env.ROUTESCAN_API_KEY })], // apiKey optional
});
```

## Options

| Option           | Default              | What it does                                                |
| ---------------- | -------------------- | ----------------------------------------------------------- |
| `apiKey`         | none                 | Optional; verification is keyless, a key raises rate limits |
| `network`        | from the chain id    | `"mainnet"` \| `"testnet"` — override the derived index     |
| `apiUrl`         | built from the chain | Replace the whole base URL                                  |
| `pollIntervalMs` | `2000`               | Milliseconds between status polls                           |
| `maxPolls`       | `20`                 | Bounds both the submit retry and the status poll            |

## How the URL is built

```text
https://api.routescan.io/v2/network/{mainnet|testnet}/evm/{chainId}/etherscan/api
```

The chain id is in the **path**, not a query parameter — unlike Etherscan V2, which needs it as one.

Routescan keeps mainnets and testnets in two separate indexes, and the segment is part of the URL, so
the wrong one answers about a chain the contract is not on: for a Sepolia address, `mainnet` returns an
empty result that reads exactly like "not verified". The segment is derived from **viem's own chain
metadata** (`testnet: true`), which is the maintained list we would otherwise be copying — so every
chain viem ships is right with no configuration. A chain viem does not know reads as `mainnet`; use
`network` for those.

## Notes from live use

Verified against Sepolia. Two things worth knowing:

**Routescan's queue is slower than Etherscan's.** The default budget (`maxPolls: 20` × 2 s = 40 s) was
not always enough; raise `maxPolls` if you see timeouts.

**Its `checkverifystatus` and `getsourcecode` can disagree.** A submission reported
`Pass - Verified` while `getsourcecode` still returned an empty result for the same address. The plugin
reports what the status endpoint says, since that is the API's own answer about the job it was given.

## What it verifies from

Both hooks send the exact standard-json input the deploy pinned to
`deployments/sources/<hash>.json`, so nothing is recompiled and `deployoor verify` works long after
the source tree moved on. See [Verify contracts](https://deployoor.dev/guides/verify).

MIT
