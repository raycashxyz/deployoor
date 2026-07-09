import { defineConfig } from "hardhat/config";
import deployoor from "@deployoor/hardhat/v3";

// Minimal Hardhat 3 project (ESM config + `defineConfig`). `hardhat compile` writes the new
// hh3-artifact-1 artifacts + split build-info; the @deployoor/hardhat/v3 plugin (registered in
// `plugins`) then regenerates the typed deployers — no separate `deployoor generate` step.
// (On Hardhat 3 plugins are added to `plugins`; the Hardhat 2 entry registers by side effect.)
export default defineConfig({
  plugins: [deployoor],
  solidity: {
    version: "0.8.28",
  },
});
