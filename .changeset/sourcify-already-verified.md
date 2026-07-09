---
"@deployoor/sourcify": patch
---

Treat Sourcify v2 already-verified contracts as success. Real Sourcify v2 does not
return HTTP 409 for an already-verified contract — it accepts the job (202) and then
completes it carrying `error.customCode: "already_verified"`. The verifier now
recognizes that code and resolves (matching the etherscan plugin) instead of throwing,
so idempotent re-deploys of an already-verified contract no longer fail verification.
