import { defineConfig } from "deployoor";

/**
 * What a deployoor config is still for.
 *
 * `out` and `deploymentsPath` are deployoor's own, so nothing else can tell it where they go. The
 * other five examples in this repo have no config file at all for that reason: their paths are the
 * defaults.
 *
 * `artifactsPath` is here for a narrower reason worth understanding, because it is the common case
 * rather than an exotic one. deployoor normally reads `paths.artifacts` out of hardhat.config, so you
 * do not repeat it — but it reads it by *importing* that file, and this config registers a plugin
 * (`require("@deployoor/hardhat")`). A config that registers anything cannot be imported outside a
 * Hardhat run; it throws `HH5: HardhatContext is not created`. `deployoor generate` still works,
 * because the Hardhat plugin hands the resolved path over directly — but a deploy or a test has to
 * read the config itself, and cannot. So the one line below is what makes those work.
 */
export default defineConfig({
  artifactsPath: "./build/artifacts",
  out: "./generated/deployers",
  deploymentsPath: "./records",
});
