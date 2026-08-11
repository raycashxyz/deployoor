import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ArtifactsNotFound } from "../errors";
import type { Artifact } from "../schemas";
import { DETECTION_MARKERS, detectFramework, detectToolchain, type Framework } from "./detect";
import { readFoundryOutPath, readHardhatArtifactsPath } from "./framework-config";
import { readHardhatArtifacts } from "./hardhat";
import { readFoundryArtifacts } from "./foundry";
import { readTevmArtifacts, type ReadTevmOptions } from "./tevm";

export { detectFramework, detectToolchain, type Framework } from "./detect";
export { readFoundryOutPath, readHardhatArtifactsPath } from "./framework-config";
export { readHardhatArtifacts } from "./hardhat";
export { readFoundryArtifacts } from "./foundry";
export { readTevmArtifacts, type ReadTevmOptions } from "./tevm";

export interface ReadArtifactsOptions extends ReadTevmOptions {
  /** Override toolchain auto-detection (e.g. `"tevm"` for a plain `.sol` project). */
  readonly framework?: Framework;
  /** Artifacts directory, when it is not the framework default. See `Config.artifactsPath`. */
  readonly artifactsPath?: string;
}

/** Where each on-disk toolchain writes its artifacts unless its own config says otherwise. */
const DEFAULT_OUTPUT_DIR = { hardhat: "./artifacts", foundry: "./out" } as const;

/**
 * Where to read artifacts from, in precedence order:
 *
 *   1. `artifactsPath` — an explicit answer from the user always wins.
 *   2. The framework's own config — `paths.artifacts` in hardhat.config, `out` in foundry.toml.
 *   3. The framework default.
 *
 * Step 2 is what makes a moved output directory work with no deployoor config: the project already
 * states where its artifacts go, so asking the user to repeat it here is a needless second source of
 * truth that can drift. It is best-effort (see framework-config.ts) and falls through to the default.
 */
const artifactsDirFor = async (
  root: string,
  framework: "hardhat" | "foundry",
  artifactsPath: string | undefined,
): Promise<{ dir: string; source: "configured" | "framework-config" | "default" }> => {
  if (artifactsPath !== undefined) {
    return { dir: resolve(root, artifactsPath), source: "configured" };
  }

  const fromFramework =
    framework === "hardhat" ? await readHardhatArtifactsPath(root) : readFoundryOutPath(root);
  if (fromFramework !== undefined) {
    return { dir: resolve(root, fromFramework), source: "framework-config" };
  }

  return { dir: resolve(root, DEFAULT_OUTPUT_DIR[framework]), source: "default" };
};

/**
 * Resolve the artifacts directory and check it is there, so the failure can say which toolchain was
 * detected and which of "not compiled" / "output is elsewhere" to fix — the adapters only see a
 * path, so left to them the message cannot tell those apart.
 */
const resolveOutputDir = async (
  root: string,
  framework: "hardhat" | "foundry",
  opts: Pick<ReadArtifactsOptions, "artifactsPath" | "framework">,
): Promise<string> => {
  const { dir, source } = await artifactsDirFor(root, framework, opts.artifactsPath);
  if (existsSync(dir)) return dir;
  throw new ArtifactsNotFound({
    dir,
    context: {
      kind: "missing-output-dir",
      framework,
      // Absent when the framework came from config rather than from a file on disk.
      marker: opts.framework === undefined ? detectToolchain(root)?.marker : undefined,
      source,
    },
  });
};

const noToolchain = (root: string): never => {
  throw new ArtifactsNotFound({
    dir: root,
    context: { kind: "no-toolchain", markers: DETECTION_MARKERS },
  });
};

/**
 * Read a Hardhat (v2/v3) or Foundry project's on-disk artifacts synchronously.
 *
 * Reads the framework default only. Honouring a moved output dir means loading hardhat.config, which
 * is async — use `readArtifactsAsync` (what the CLI runs) for that.
 */
export const readArtifacts = (root: string): Artifact[] => {
  const framework = detectFramework(root);
  const dirFor = (name: "hardhat" | "foundry") => {
    const dir = resolve(root, DEFAULT_OUTPUT_DIR[name]);
    if (existsSync(dir)) return dir;
    throw new ArtifactsNotFound({
      dir,
      context: {
        kind: "missing-output-dir",
        framework: name,
        marker: detectToolchain(root)?.marker,
        source: "default",
      },
    });
  };
  if (framework === "hardhat") return readHardhatArtifacts(dirFor("hardhat"));
  if (framework === "foundry") return readFoundryArtifacts(dirFor("foundry"));
  return noToolchain(root);
};

/**
 * Detect the toolchain (or take the configured override) and read its compiled artifacts.
 * Async because the tevm adapter compiles `.sol` on demand; Hardhat/Foundry stay a plain
 * on-disk read.
 */
export const readArtifactsAsync = async (
  root: string,
  opts: ReadArtifactsOptions = {},
): Promise<Artifact[]> => {
  const framework = opts.framework ?? detectFramework(root);
  if (framework === "hardhat") return readHardhatArtifacts(await resolveOutputDir(root, "hardhat", opts));
  if (framework === "foundry") return readFoundryArtifacts(await resolveOutputDir(root, "foundry", opts));
  if (framework === "tevm") return readTevmArtifacts(root, opts);
  return noToolchain(root);
};
