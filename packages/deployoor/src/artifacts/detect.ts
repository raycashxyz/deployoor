import { existsSync } from "node:fs";
import { join } from "node:path";

export type Framework = "hardhat" | "foundry" | "tevm";

const has = (root: string, ...names: string[]): boolean => names.some((name) => existsSync(join(root, name)));

/**
 * Detect the toolchain in a project root. Foundry is checked first (a project can have both,
 * but `out/` + `foundry.toml` is the more specific signal), then Hardhat (v2 or v3 — same
 * `hardhat.config.*` + `artifacts/`), then tevm (a `tevm.config.*`, since a tevm project has
 * neither Hardhat nor Foundry output). A `framework` in deployoor.config.ts overrides this.
 */
export const detectFramework = (root: string): Framework | null => {
  if (has(root, "foundry.toml", "out")) return "foundry";
  if (
    has(
      root,
      "hardhat.config.ts",
      "hardhat.config.js",
      "hardhat.config.cjs",
      "hardhat.config.mjs",
      "artifacts",
    )
  ) {
    return "hardhat";
  }
  if (has(root, "tevm.config.ts", "tevm.config.js", "tevm.config.json")) return "tevm";
  return null;
};
