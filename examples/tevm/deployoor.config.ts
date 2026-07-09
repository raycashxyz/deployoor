import { defineConfig } from "deployoor";

// A plain-Solidity project — no Hardhat, no Foundry. `framework: "tevm"` tells
// `deployoor generate` to compile the contracts under `sources` with tevm's compiler
// (@tevm/compiler + solc) and emit typed deployers. (A `tevm.config.*` file would also be
// auto-detected; here we set it explicitly.)
export default defineConfig({
  framework: "tevm",
  sources: "./src",
  deploymentsPath: "./deployments",
  out: "./deployers",
});
