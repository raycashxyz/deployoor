import { defineConfig } from "deployoor";

// A plain-Solidity project — no Hardhat, no Foundry. deployoor auto-detects it as a tevm
// project (no Foundry/Hardhat markers + `.sol` sources under src/) and compiles the contracts
// with tevm's compiler (@tevm/compiler + solc) during `deployoor generate`. No `framework` or
// `sources` needed here; set `framework: "tevm"` (or add a `tevm.config.*`) only to be explicit
// or when your sources live outside src/ or contracts/.
export default defineConfig({
  deploymentsPath: "./deployments",
  out: "./deployers",
});
