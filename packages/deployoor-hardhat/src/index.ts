import { extendConfig, task } from "hardhat/config";
import { TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import { generateDeployers } from "deployoor/generate";
import { runAfterCompile } from "./runner";
import "./type-extensions";

/**
 * @deployoor/hardhat — regenerate deployoor's typed deployers automatically after every
 * `hardhat compile`, in process. No extra terminal, no separate `deployoor generate` step:
 * the moment Hardhat writes fresh `artifacts/`, the deployers are rebuilt from them.
 *
 * Add it to your Hardhat config:
 *
 *   // hardhat.config.ts
 *   import "@deployoor/hardhat";
 *   // hardhat.config.js
 *   require("@deployoor/hardhat");
 *
 * Opt out per project with `deployoor: { generate: false }` in the Hardhat config.
 */
extendConfig((config, userConfig) => {
  config.deployoor = { generate: userConfig.deployoor?.generate ?? true };
});

// Wrap the built-in compile: run it, then regenerate from the fresh artifacts.
task(TASK_COMPILE).setAction(async (args, hre, runSuper) => {
  const result = await runSuper(args);
  await runAfterCompile({
    root: hre.config.paths.root,
    enabled: hre.config.deployoor.generate,
    generate: generateDeployers,
  });
  return result;
});
