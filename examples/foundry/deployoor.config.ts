import { defineConfig } from "deployoor";

// Foundry project: deployoor auto-detects foundry.toml + out/ and reads the artifacts.
export default defineConfig({
  deploymentsPath: "./deployments",
  out: "./deployers",
});
