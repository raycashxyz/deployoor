---
"@deployoor/etherscan": patch
---

Fix two bugs that made live Etherscan verification fail — both found by a real Sepolia deploy

Neither was reachable from a mock `fetch`, and both were shipped.

**`chainid` was only in the POST body.** Etherscan V2 requires it as a query parameter, and rejects a body-only value:

```text
Missing or unsupported chainid parameter (required for v2 api)
```

So _every_ live verification failed at submit — deploy-time and `deployoor verify` alike. The status poll already put `chainid` on the URL, which is why only the submit broke. It is now on the URL for both, and kept in the body too, since Blockscout/Routescan endpoints reached via `apiUrl` read it from there.

The test suite asserted every form field of that request and nothing about its URL, so a body-only `chainid` passed. It is asserted now.

**Deploy-time verification lost a race with Etherscan's indexer.** Submitting straight after the receipt gets:

```text
Unable to locate ContractCode at 0x…
```

The chain is simply ahead of the explorer. That was a hard failure, so a fresh deploy's verification usually failed and had to be recovered with `deployoor verify` afterwards. The submit is now re-tried on that specific reply (bounded by `maxPolls`, the same budget the status poll uses), which is what hardhat-verify does. Observed live: six retries over about twelve seconds, then verified in the same run.

`maxPolls` is also validated as a positive integer now. It bounds both recursions, so `0` skipped the status poll and reported a timeout on a verification that may have passed, and `NaN` — what `Number()` of an unset env var gives — failed every comparison and made the first attempt the last.

Verified end to end on Sepolia — `Counter`, `Greeter` and `Vault` deployed with a Privy server wallet and confirmed verified through Etherscan's own `getsourcecode`.
