---
"@deployoor/etherscan": minor
"@deployoor/slack": minor
---

Reject an empty `apiKey` / `webhook` when the plugin is constructed, and stop the docs asserting the environment variable is set

The examples everywhere showed `etherscan({ apiKey: process.env.ETHERSCAN_KEY! })`. The `!` only silences the type — at runtime an unset variable made `apikey: undefined` part of the request, so the failure arrived from the explorer as an authentication error at the end of a deploy, naming nothing you could act on. `@deployoor/slack` had the same shape with `webhook`.

Both now check when the credential is actually needed — a verification starting, a notification about to be sent:

```text
@deployoor/etherscan: apiKey is required and was empty. Etherscan V2 needs one key for every
chain — set it in your environment (e.g. ETHERSCAN_KEY) and pass it as
`etherscan({ apiKey: process.env.ETHERSCAN_KEY })`.
```

`EtherscanOptions.apiKey` and `SlackOptions.webhook` are typed `string | undefined` so the env-var expression reads through without an assertion. Both keys stay **required**, so `etherscan({})` is still a compile error — the only thing now permitted is passing a value that might be missing, which is exactly the case the runtime check exists for. Internally the checked options are a separate type, so it is the type rather than a convention that keeps an unchecked `undefined` out of a request.

Checked at first use rather than when the plugin is constructed, deliberately. `deployoor.config.ts` is imported by *every* command, so a construction-time throw made `deployoor generate` exit with an Etherscan credential error over a key it never uses — worse than the problem being fixed, since working locally without an explorer key is the normal case. The check still runs before the first request, so the failure is still local and still names the variable.
