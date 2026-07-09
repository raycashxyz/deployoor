import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type Framework = "hardhat" | "foundry" | "tevm";

const has = (root: string, ...names: string[]): boolean => names.some((name) => existsSync(join(root, name)));

const hasHardhatConfig = (root: string): boolean =>
  has(root, "hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs");

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
 * Detect the toolchain in a project root, in order: Foundry (`foundry.toml`), then Hardhat (a
 * `hardhat.config.*` — same file for v2 and v3), then tevm — either an explicit `tevm.config.*`,
 * or, as a zero-config fallback, a plain-Solidity project (no Foundry/Hardhat config) with `.sol`
 * sources under `src/` or `contracts/`. A `framework` in deployoor.config.ts overrides all of this.
 *
 * Detection keys on the **config file**, not the output dir: a bare `out/` or `artifacts/` is a
 * generic name a plain TS build (or another tool) can also produce, so keying on it would both
 * misdetect non-Solidity projects and let a leftover `artifacts/` hijack a tevm project. The
 * config file also correctly identifies a not-yet-compiled project — the output dir is then
 * validated when the adapter reads it (a clear "compile first" error), rather than silently
 * falling through to tevm and compiling the same sources with different settings.
 *
 * The tevm fallback is last on purpose: reading Foundry/Hardhat artifacts is passive, whereas the
 * tevm path *compiles*, so it only kicks in once the other toolchains are ruled out.
 */
export const detectFramework = (root: string): Framework | null => {
  if (has(root, "foundry.toml")) return "foundry";
  if (hasHardhatConfig(root)) return "hardhat";
  if (has(root, "tevm.config.ts", "tevm.config.js", "tevm.config.json")) return "tevm";
  if (TEVM_SOURCE_DIRS.some((dir) => containsSolidity(join(root, dir)))) return "tevm";
  return null;
};
