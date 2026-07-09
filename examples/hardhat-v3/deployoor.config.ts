import { defineConfig } from "deployoor";

// Hardhat project: deployoor auto-detects hardhat.config.* + artifacts/ and reads them
// (the same reader handles Hardhat 2 and Hardhat 3 artifacts).
export default defineConfig({
  deploymentsPath: "./deployments",
  out: "./deployers",
});
