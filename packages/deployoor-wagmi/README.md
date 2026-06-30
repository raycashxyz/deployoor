# @deployoor/wagmi

> A [`@wagmi/cli`](https://wagmi.sh/cli) plugin that sources contracts from a [deployoor](../deployoor) `deployments/` folder.

[deployoor](../deployoor) deploys your contracts and records each one as `deployments/<network>/<Contract>.json`. This plugin reads that folder and hands the contracts to `@wagmi/cli`, which generates the ABIs, per-chain address maps, and framework bindings. You write addresses nowhere — they come from your own deploys.

## Install

```bash
pnpm add -D @deployoor/wagmi @wagmi/cli
```

## Usage

```ts
// wagmi.config.ts
import { defineConfig } from "@wagmi/cli";
import { actions } from "@wagmi/cli/plugins";
import { deployments } from "@deployoor/wagmi";

export default defineConfig({
  out: "src/generated.ts",
  plugins: [
    deployments({ path: "./deployments" }), // default: './deployments'
    actions(), // or react(), or nothing
  ],
});
```

```bash
wagmi generate
```

The same contract deployed to several chains is folded into a single entry whose `address` is a `{ [chainId]: address }` map — exactly the shape `@wagmi/cli` wants for multi-chain contracts.

## API

### `deployments(options?)`

Returns a `@wagmi/cli` `Plugin`.

- `options.path` — path to the deployoor `deployments/` folder. Default `'./deployments'`.

### `readDeploymentContracts(deploymentsPath)`

The underlying reader, exported for tooling and tests. Walks the folder, validates each JSON record, and returns `@wagmi/cli` `ContractConfig[]` grouped by deployment name. JSON files that aren't deployoor deployment records are skipped.

## License

MIT
