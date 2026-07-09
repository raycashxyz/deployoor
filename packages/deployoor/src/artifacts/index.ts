import { join } from "node:path";
import { ArtifactsNotFound } from "../errors";
import type { Artifact } from "../schemas";
import { detectFramework, type Framework } from "./detect";
import { readHardhatArtifacts } from "./hardhat";
import { readFoundryArtifacts } from "./foundry";
import { readTevmArtifacts, type ReadTevmOptions } from "./tevm";

export { detectFramework, type Framework } from "./detect";
export { readHardhatArtifacts } from "./hardhat";
export { readFoundryArtifacts } from "./foundry";
export { readTevmArtifacts, type ReadTevmOptions } from "./tevm";

export interface ReadArtifactsOptions extends ReadTevmOptions {
  /** Override toolchain auto-detection (e.g. `"tevm"` for a plain `.sol` project). */
  readonly framework?: Framework;
}

/** Read a Hardhat (v2/v3) or Foundry project's on-disk artifacts synchronously. */
export const readArtifacts = (root: string): Artifact[] => {
  const framework = detectFramework(root);
  if (framework === "hardhat") return readHardhatArtifacts(join(root, "artifacts"));
  if (framework === "foundry") return readFoundryArtifacts(join(root, "out"));
  throw new ArtifactsNotFound({ dir: root });
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
  if (framework === "hardhat") return readHardhatArtifacts(join(root, "artifacts"));
  if (framework === "foundry") return readFoundryArtifacts(join(root, "out"));
  if (framework === "tevm") return readTevmArtifacts(root, opts);
  throw new ArtifactsNotFound({ dir: root });
};
