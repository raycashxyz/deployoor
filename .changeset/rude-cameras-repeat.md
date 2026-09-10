---
"deployoor": minor
"@deployoor/docs": patch
---

`deployoor verify --json` and `deployoor generate --json`, for scripts and agents that should not have to parse a summary

`verify --json` prints the whole run as one JSON document and nothing else:

```json
{
  "ok": false,
  "plugins": ["etherscan"],
  "counts": { "verified": 1, "failed": 0, "unverifiable": 1, "skipped": 0 },
  "results": [
    {
      "deploymentName": "Counter",
      "contractName": "Counter",
      "networkName": "11155111-sepolia",
      "chainId": 11155111,
      "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      "outcome": { "status": "verified", "plugins": ["etherscan"] }
    }
  ]
}
```

`results` is the `VerifyResult` list verbatim — the same fields and the same discriminated `outcome` the summary prints from, so the two cannot drift apart — and `counts` carries all four statuses whether or not anything landed in them. The exit code is unchanged: non-zero when any record failed or could not be verified.

Stdout stays a single JSON value. Verifier plugins keep streaming their progress (`[etherscan] … verified`), on stderr, so `deployoor verify --json > report.json` leaves a file that parses and a terminal that still shows the run.

`generate --json` prints `{ "files": [...] }`, the written paths relative to the project root. It implies unattended: neither the install offer nor the `.gitignore` question is asked, a missing `deployoor`/`viem` fails with the command to install them, and the `.gitignore` advice goes to stderr.

`verify`'s argument parser now handles boolean flags as their own kind, so `--json` consumes no value and the token after it is still reported as an unexpected argument. `--json=true` is rejected as bad usage. `generate` validates its command line the same way — an unknown option, a positional argument, or `--json=true` fails before anything is read or written, where it used to be silently ignored.
