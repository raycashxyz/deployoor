import { defineConfig } from "deployoor";

// Hardhat project: deployoor auto-detects hardhat.config.* + artifacts/ and reads them.
export default defineConfig({
  deploymentsPath: "./deployments",
  out: "./deployers",
});
