# @deployoor/slack

> Notify a Slack channel when [deployoor](../deployoor) deploys a contract.

A deployoor plugin is just a deploy-lifecycle hook — the same shape a verifier uses. This one posts to a Slack Incoming Webhook each time a contract is freshly deployed.

## Install

```bash
pnpm add -D @deployoor/slack
```

## Usage

```ts
// deployoor.config.ts
import { defineConfig } from "deployoor";
import { slack } from "@deployoor/slack";

export default defineConfig({
  plugins: [slack({ webhook: process.env.SLACK_WEBHOOK! })],
});
```

Every fresh deploy posts a message like:

> **Token** deployed to `0x…c0` on base (chain 8453)

Reused deployments (no transaction) are skipped. A non-2xx webhook response throws, so it obeys the deployer's `onPluginError` policy — `"warn"` (default) logs and continues, `"throw"` fails the run.

## Options

```ts
slack({
  webhook: "https://hooks.slack.com/services/…", // required
  username: "deployoor-bot", // optional bot name
  format: (d) => `${d.contractName} live at ${d.address}`, // optional message builder
});
```

Per deploy, override the message or skip a contract entirely:

```ts
await getOrDeployVault({ ...clients, args, plugins: { slack: { text: "Vault is live 🎉" } } });
await getOrDeployToken({ ...clients, args, plugins: { slack: false } }); // no notification
```

## License

MIT
