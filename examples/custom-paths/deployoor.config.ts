import { defineConfig } from "deployoor";

/**
 * What a deployoor config is still for.
 *
 * Note what is *absent*: `artifactsPath`. Hardhat already knows its artifacts go to
 * `build/artifacts` (see hardhat.config.js), and deployoor reads that from hardhat.config —
 * `paths.artifacts` for Hardhat, `out` for Foundry. Repeating it here would create a second copy of
 * a setting that already has an owner, and the copy is then free to drift from it. The other five
 * examples in this repo have no config file at all for the same reason: their paths are the defaults.
 *
 * The two below are deployoor's own, so nothing else can tell it where they go.
 */
export default defineConfig({
  out: "./generated/deployers",
  deploymentsPath: "./records",
});
