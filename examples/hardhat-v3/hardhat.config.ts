import { defineConfig } from "hardhat/config";

// Minimal Hardhat 3 project (ESM config + `defineConfig`). `hardhat compile` writes the new
// hh3-artifact-1 artifacts + split build-info; `deployoor generate` reads them.
//
// Note: the @deployoor/hardhat plugin targets Hardhat 2's task API, so on Hardhat 3 we run
// `deployoor generate` explicitly after compile (see the package.json scripts).
export default defineConfig({
  solidity: {
    version: "0.8.28",
  },
});
