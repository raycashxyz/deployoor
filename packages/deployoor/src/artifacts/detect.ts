import { existsSync } from "node:fs";
import { join } from "node:path";

/** The toolchains deployoor reads compiled artifacts from. */
export const FRAMEWORKS = ["hardhat", "foundry"] as const;

export type Framework = (typeof FRAMEWORKS)[number];

/** Runtime guard for a `framework` read out of a user's config, which no type checker has seen. */
export const isFramework = (value: unknown): value is Framework =>
  FRAMEWORKS.some((framework) => framework === value);

/** A detected toolchain plus the file or directory that gave it away, so errors can cite it. */
export interface DetectedToolchain {
  readonly framework: Framework;
  /** e.g. "hardhat.config.ts", "foundry.toml". */
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

/**
 * Detect the toolchain in a project root, in order: Foundry (`foundry.toml`), then Hardhat (a
 * `hardhat.config.*` — same file for v2 and v3). A `framework` in deployoor.config.ts overrides this.
 *
 * Detection keys on the **config file**, not the output dir: a bare `out/` or `artifacts/` is a
 * generic name a plain TS build (or another tool) can also produce, so keying on it would misdetect
 * non-Solidity projects. The config file also correctly identifies a not-yet-compiled project — the
 * output dir is then validated when the adapter reads it (a clear "compile first" error).
 *
 * `.sol` sources alone are not a toolchain: deployoor reads compiled artifacts and never compiles, so
 * a plain-Solidity project with neither marker is reported as undetected.
 */
export const detectToolchain = (root: string): DetectedToolchain | null => {
  const foundry = firstPresent(root, "foundry.toml");
  if (foundry !== undefined) return { framework: "foundry", marker: foundry };

  const hardhat = firstPresent(root, ...HARDHAT_CONFIGS);
  if (hardhat !== undefined) return { framework: "hardhat", marker: hardhat };

  return null;
};

/** What deployoor looks for, quoted back by the "could not detect" error. */
export const DETECTION_MARKERS = `foundry.toml (Foundry) or ${HARDHAT_CONFIGS.join(" / ")} (Hardhat)`;

export const detectFramework = (root: string): Framework | null => detectToolchain(root)?.framework ?? null;
