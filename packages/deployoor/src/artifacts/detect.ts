import { existsSync } from "node:fs";
import { join } from "node:path";

export type Framework = "hardhat" | "foundry";

/**
 * Detect the toolchain in a project root. Foundry is checked first (a project can
 * have both, but `out/` + `foundry.toml` is the more specific signal).
 */
export const detectFramework = (root: string): Framework | null => {
  if (existsSync(join(root, "foundry.toml")) || existsSync(join(root, "out"))) return "foundry";
  if (
    existsSync(join(root, "hardhat.config.ts")) ||
    existsSync(join(root, "hardhat.config.js")) ||
    existsSync(join(root, "artifacts"))
  ) {
    return "hardhat";
  }
  return null;
};
