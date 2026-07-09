# @deployoor/hardhat

> A [Hardhat](https://hardhat.org) plugin that regenerates [deployoor](https://www.npmjs.com/package/deployoor)'s typed deployers automatically after every `hardhat compile`. Works on **Hardhat 2 and Hardhat 3**.

Without it, the flow is two steps — `hardhat compile` then `deployoor generate`. With it, `hardhat compile` runs `deployoor generate` in process the moment fresh `artifacts/` are written: no extra terminal, no separate command, no stale deployers. Edit a contract, compile, and the typed `getOrDeploy<Name>` functions are already up to date.

Hardhat 2 and Hardhat 3 register plugins differently, so there are two entry points in this one package: the default (`@deployoor/hardhat`, Hardhat 2) and `@deployoor/hardhat/v3` (Hardhat 3). Both do the same thing.

## Install

```bash
pnpm add -D @deployoor/hardhat deployoor viem
```

You still need a `deployoor.config.ts` (run `npx deployoor init` once).

## Usage — Hardhat 2

Hardhat 2 registers plugins by side effect, so importing the default entry is enough:

```ts
// hardhat.config.ts
import "@deployoor/hardhat";

export default {
  solidity: "0.8.24",
};
```

```js
// hardhat.config.js (CommonJS)
require("@deployoor/hardhat");

module.exports = { solidity: "0.8.24" };
```

## Usage — Hardhat 3

Hardhat 3 is declarative and ESM-only: import the `/v3` plugin object and add it to `plugins`.

```ts
// hardhat.config.ts
import { defineConfig } from "hardhat/config";
import deployoor from "@deployoor/hardhat/v3";

export default defineConfig({
  plugins: [deployoor],
  solidity: "0.8.28",
});
```

Either way, every compile now regenerates the deployers:

```bash
npx hardhat compile
# deployoor: generated 3 deployer file(s)
```

## Options

**Hardhat 2** — configure under a `deployoor` key in your Hardhat config:

```ts
export default {
  solidity: "0.8.24",
  deployoor: {
    generate: false, // opt out of auto-generation (default: true)
  },
};
```

| Option     | Type      | Default | Description                                            |
| ---------- | --------- | ------- | ------------------------------------------------------ |
| `generate` | `boolean` | `true`  | Run `deployoor generate` after each `hardhat compile`. |

**Hardhat 3** — to disable auto-generation, remove the plugin from `plugins` (Hardhat 3 has no side-effect registration to toggle with a config flag).

Output location, which contracts to include, and the deployments path all come from your `deployoor.config.ts` — this plugin only decides _when_ generation runs.

## Notes

- **Compile never breaks.** If generation fails (no config yet, nothing compiled, a bad `include`), the plugin logs a warning and lets `hardhat compile` finish — it never rethrows.
- It calls deployoor's programmatic `generateDeployers` (exported from [`deployoor/generate`](../deployoor)) — exactly what the `deployoor generate` CLI runs, so results are identical whichever way you trigger it.
- Foundry users get the same behavior via `forge build`'s hooks or a `forge build && deployoor generate` script; this plugin is the Hardhat-native convenience.

## License

MIT
