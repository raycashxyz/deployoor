# @deployoor/sourcify

> Verify contracts on [Sourcify](https://sourcify.dev) when [deployoor](../deployoor) deploys them.

A deployoor verifier is just a deploy-lifecycle hook. On each fresh deploy this plugin submits the contract's standard-json-input to the **Sourcify v2 API** — keyless, one host for every supported chain — and polls the verification job until it settles.

## Install

```bash
pnpm add -D @deployoor/sourcify
```

## Usage

```ts
// deployoor.config.ts
import { defineConfig } from "deployoor";
import { sourcify } from "@deployoor/sourcify";

export default defineConfig({
  plugins: [sourcify()], // no API key needed
});
```

It reads everything from the deployment and the compiler metadata deployoor captures at deploy time — chainId, address, fully-qualified name, compiler version, standard-json input, and the creation transaction hash (which lets Sourcify fetch creation bytecode reliably). Reused deployments are skipped. A verification failure throws, so it obeys the deployer's `onPluginError` policy.

Stack it with `@deployoor/etherscan` to publish to both — they're independent hooks:

```ts
plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY! }), sourcify()];
```

## Options

```ts
sourcify({
  serverUrl: "https://sourcify.dev/server", // default; override for a self-hosted server or a mock
  pollIntervalMs: 2000, // job-status poll interval
  maxPolls: 20, // give up after this many polls
});
```

## License

MIT
