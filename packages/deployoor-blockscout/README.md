# @deployoor/blockscout

Verify contracts on any [Blockscout](https://blockscout.com) instance — at deploy time, or after the
fact with `deployoor verify`.

```bash
npm i -D @deployoor/blockscout
```

```ts
// deployoor.config.ts
import { defineConfig } from "deployoor";
import { blockscout } from "@deployoor/blockscout";

export default defineConfig({
  plugins: [
    blockscout({
      instanceUrl: "https://eth-sepolia.blockscout.com",
      apiKey: process.env.BLOCKSCOUT_API_KEY, // optional — raises rate limits
    }),
  ],
});
```

## Options

| Option           | Default    | What it does                                                |
| ---------------- | ---------- | ----------------------------------------------------------- |
| `instanceUrl`    | _required_ | The Blockscout instance. `/api` is appended for you         |
| `apiKey`         | none       | Optional; verification is keyless, a key raises rate limits |
| `pollIntervalMs` | `2000`     | Milliseconds between status polls                           |
| `maxPolls`       | `20`       | Bounds both the submit retry and the status poll            |

## Why `instanceUrl` has no default

Blockscout is not one service — it is software that many chains and teams run their own instance of, so
there is no host that means "Blockscout" the way `api.etherscan.io` means Etherscan. Deriving one from
the chain id would need a table that is wrong for every self-hosted instance and stale for every new
chain, and a wrong instance answers about a **different chain**. So it asks.

A few public ones:

| Chain    | `instanceUrl`                        |
| -------- | ------------------------------------ |
| Ethereum | `https://eth.blockscout.com`         |
| Sepolia  | `https://eth-sepolia.blockscout.com` |
| Base     | `https://base.blockscout.com`        |
| Optimism | `https://optimism.blockscout.com`    |
| Gnosis   | `https://gnosis.blockscout.com`      |

## Notes from live use

**"Already verified" is a normal first run.** An instance may import a verification from another
explorer. A contract verified on Etherscan showed as already verified on Blockscout minutes later, with
a `verified_at` matching the Etherscan submission — so the plugin treats that reply as success rather
than an error.

**Deploy-time verification races the indexer.** Submitting straight after the receipt can get "not
found" because the chain is ahead of the explorer; the plugin re-submits, bounded by `maxPolls`.

**Some instances verify synchronously**, answering with the outcome instead of a job id. Polling for
that would ask about a job that never existed, so a first reply that is already a verdict is taken as
the conclusion.

## What it verifies from

Both hooks send the exact standard-json input the deploy pinned to
`deployments/sources/<hash>.json`, so nothing is recompiled and `deployoor verify` works long after
the source tree moved on. See [Verify contracts](https://deployoor.dev/guides/verify).

MIT
