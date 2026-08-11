import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Framework = "hardhat" | "foundry" | "tevm";

/** A detected toolchain plus the file or directory that gave it away, so errors can cite it. */
export interface DetectedToolchain {
  readonly framework: Framework;
  /** e.g. "hardhat.config.ts", "foundry.toml", "src/". */
  readonly marker: string;
}

/** The first of `names` that exists in `root` — the marker an error message can name back. */
const firstPresent = (root: string, ...names: string[]): string | undefined =>
  names.find((name) => existsSync(join(root, name)));

const HARDHAT_CONFIGS = [
  "hardhat.config.ts",
  "hardhat.config.js",
  "hardhat.config.cjs",
  "hardhat.config.mjs",
] as const;

const TEVM_CONFIGS = ["tevm.config.ts", "tevm.config.js", "tevm.config.json"] as const;

// Conventional Solidity source directories for a plain (no Hardhat/Foundry) project.
const TEVM_SOURCE_DIRS = ["src", "contracts"] as const;

/** Whether `dir` contains any `.sol` file (searched recursively, skipping node_modules). */
const containsSolidity = (dir: string): boolean =>
  existsSync(dir) &&
  readdirSync(dir).some((entry) => {
    if (entry === "node_modules") return false;
    const full = join(dir, entry);
    // lstat, not stat: stat follows symlinks, so a link pointing at an ancestor would recurse until
    // the stack blew. A symlinked source tree is not worth traversing for a detection heuristic.
    return lstatSync(full).isDirectory() ? containsSolidity(full) : entry.endsWith(".sol");
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
export const detectToolchain = (root: string): DetectedToolchain | null => {
  const foundry = firstPresent(root, "foundry.toml");
  if (foundry !== undefined) return { framework: "foundry", marker: foundry };

  const hardhat = firstPresent(root, ...HARDHAT_CONFIGS);
  if (hardhat !== undefined) return { framework: "hardhat", marker: hardhat };

  const tevm = firstPresent(root, ...TEVM_CONFIGS);
  if (tevm !== undefined) return { framework: "tevm", marker: tevm };

  const sources = TEVM_SOURCE_DIRS.find((dir) => containsSolidity(join(root, dir)));
  if (sources !== undefined) return { framework: "tevm", marker: `${sources}/` };

  return null;
};

/** What deployoor looks for, quoted back by the "could not detect" error. */
export const DETECTION_MARKERS = `foundry.toml (Foundry), ${HARDHAT_CONFIGS.join(" / ")} (Hardhat), ${TEVM_CONFIGS.join(" / ")} or .sol under ${TEVM_SOURCE_DIRS.map((d) => `${d}/`).join(" or ")} (tevm)`;

export const detectFramework = (root: string): Framework | null => detectToolchain(root)?.framework ?? null;
