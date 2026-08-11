---
"@deployoor/etherscan": minor
"@deployoor/sourcify": minor
---

Implement the new `onVerify` hook, so `deployoor verify` can verify recorded deployments after the
fact — from the sources pinned beside each record, with no recompile.

The submit-and-poll body is now one function that both hooks call, so deploy-time verification and
after-the-fact verification cannot drift: they send the same standard-json request and read the same
replies. `onContractDeployed` behaves exactly as before, including skipping when a deploy offers no
compiler input.

Requires `deployoor` ≥ the release that adds `onVerify`.
