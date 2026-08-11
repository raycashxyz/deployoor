---
"@deployoor/blockscout": minor
"@deployoor/routescan": minor
---

Add Blockscout and Routescan verifiers

Two new verifier plugins, both implementing `onContractDeployed` and `onVerify` — so they run at deploy time and replay through `deployoor verify` from the sources a deploy pinned.

```ts
import { blockscout } from "@deployoor/blockscout";
import { routescan } from "@deployoor/routescan";

export default defineConfig({
  plugins: [blockscout({ instanceUrl: "https://eth-sepolia.blockscout.com" }), routescan()],
});
```

**Blockscout** requires `instanceUrl` and does not guess one. Blockscout is software many chains and teams run their own instance of rather than a single service, so a table mapping chain id to host would be wrong for every self-hosted instance — and a wrong instance answers about a different chain. The `/api` suffix is added for you. `apiKey` is optional; verification is keyless and a key only raises rate limits.

**Routescan** puts the chain id in the URL path, not a query parameter, and keeps mainnets and testnets in separate indexes. The segment is derived from **viem's own chain metadata** (`testnet: true`), which is the maintained list we would otherwise be copying, so every chain viem ships is right with no configuration. `network` overrides it for a chain viem does not know.

`maxPolls` and `pollIntervalMs` are both validated as usable numbers before any request goes out. `setTimeout` takes a 32-bit signed delay, so a negative, `NaN`, or too-large interval is clamped to **1 ms** — which does not error, it burns the whole poll budget in milliseconds and reports a timeout on a verification the explorer was still working on.

Both were verified against live Sepolia rather than only mocks. What that turned up:

- Blockscout treats an imported verification as "already verified" — a contract verified on Etherscan showed as already verified there minutes later, so that reply is success, not an error.
- Some Blockscout instances verify synchronously, answering with the outcome instead of a job id; polling for that would ask about a job that never existed.
- Routescan's queue is slower than Etherscan's — the default 40-second budget was not always enough.
- Routescan's `checkverifystatus` reported `Pass - Verified` while its own `getsourcecode` still returned an empty result for the same address.
