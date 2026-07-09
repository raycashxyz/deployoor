import { overrideTask } from "hardhat/config";
import type { HardhatPlugin } from "hardhat/types/plugins";

/**
 * `@deployoor/hardhat/v3` — the Hardhat **3** plugin. Hardhat 3 is declarative and ESM-only, so
 * (unlike the Hardhat 2 entry, which registers by side effect) you import this object and add it
 * to `plugins`:
 *
 * ```ts
 * // hardhat.config.ts
 * import { defineConfig } from "hardhat/config";
 * import deployoor from "@deployoor/hardhat/v3";
 *
 * export default defineConfig({ plugins: [deployoor], solidity: "0.8.28" });
 * ```
 *
 * It overrides the built-in `compile` task to regenerate the typed deployers after each compile —
 * the same `generateDeployers` the CLI runs. To disable it, remove it from `plugins` (Hardhat 3
 * has no side-effect registration to toggle). On Hardhat 2, use the default `@deployoor/hardhat`
 * entry instead.
 */
const deployoor: HardhatPlugin = {
  id: "deployoor",
  // Hardhat forbids inline actions in plugins, so the action is a lazily-imported module.
  tasks: [
    overrideTask("compile")
      .setAction(() => import("./v3-compile-action.js"))
      .build(),
  ],
};

export default deployoor;
