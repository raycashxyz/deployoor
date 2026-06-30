# @deployoor/etherscan

> Verify contracts on Etherscan when [deployoor](../deployoor) deploys them.

A deployoor verifier is just a deploy-lifecycle hook. On each fresh deploy this plugin submits the contract's standard-json-input to the **Etherscan V2 API** (one endpoint, one key, every supported chain) and polls until the explorer confirms it.

## Install

```bash
pnpm add -D @deployoor/etherscan
```

## Usage

```ts
// deployoor.config.ts
import { defineConfig } from "deployoor";
import { etherscan } from "@deployoor/etherscan";

export default defineConfig({
  plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY! })],
});
```

It reads everything it needs from the deployment — address, chainId, ABI, constructor args — plus the compiler metadata deployoor captures at deploy time (fully-qualified name, compiler version, standard-json input). Constructor arguments are ABI-encoded automatically. Reused deployments (no transaction) are skipped.

A verification failure throws, so it obeys the deployer's `onPluginError` policy — `"warn"` (default) logs and continues, `"throw"` fails the run. Skip a contract with a per-deploy override:

```ts
await getOrDeployMock({ ...clients, args, plugins: { etherscan: false } });
```

## Options

```ts
etherscan({
  apiKey: "…", // required — V2 key (works across chains)
  apiUrl: "https://api.etherscan.io/v2/api", // default; override for Blockscout/Routescan or a mock
  pollIntervalMs: 2000, // status-poll interval
  maxPolls: 20, // give up after this many polls
});
```

Because Etherscan V2 is one host keyed by `chainid`, a single `etherscan()` plugin verifies on whatever chain you deploy to. The `apiUrl` override also points it at any Etherscan-compatible explorer (Blockscout, Routescan).

## License

MIT
