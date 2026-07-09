import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type Framework = "hardhat" | "foundry" | "tevm";

const has = (root: string, ...names: string[]): boolean => names.some((name) => existsSync(join(root, name)));

// Conventional Solidity source directories for a plain (no Hardhat/Foundry) project.
const TEVM_SOURCE_DIRS = ["src", "contracts"] as const;

/** Whether `dir` contains any `.sol` file (searched recursively, skipping node_modules). */
const containsSolidity = (dir: string): boolean =>
  existsSync(dir) &&
  readdirSync(dir).some((entry) => {
    if (entry === "node_modules") return false;
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? containsSolidity(full) : entry.endsWith(".sol");
  });

/**
 * Detect the toolchain in a project root. Foundry is checked first (a project can have both,
 * but `out/` + `foundry.toml` is the more specific signal), then Hardhat (v2 or v3 — same
 * `hardhat.config.*` + `artifacts/`), then tevm — either an explicit `tevm.config.*`, or, as a
 * zero-config fallback, a plain-Solidity project (no Foundry/Hardhat markers) with `.sol` sources
 * under `src/` or `contracts/`. A `framework` in deployoor.config.ts overrides all of this.
 *
 * The tevm fallback is last on purpose: reading Foundry/Hardhat artifacts is passive, whereas the
 * tevm path *compiles*, so it only kicks in once the other toolchains are ruled out.
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
  if (TEVM_SOURCE_DIRS.some((dir) => containsSolidity(join(root, dir)))) return "tevm";
  return null;
};
