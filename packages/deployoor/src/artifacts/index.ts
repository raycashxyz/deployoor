import { join } from "node:path";
import { ArtifactsNotFound } from "../errors";
import type { Artifact } from "../schemas";
import { detectFramework } from "./detect";
import { readHardhatArtifacts } from "./hardhat";
import { readFoundryArtifacts } from "./foundry";

export { detectFramework, type Framework } from "./detect";
export { readHardhatArtifacts } from "./hardhat";
export { readFoundryArtifacts } from "./foundry";

/** Detect the toolchain in `root` and read its compiled artifacts. */
export const readArtifacts = (root: string): Artifact[] => {
  const framework = detectFramework(root);
  if (framework === "hardhat") return readHardhatArtifacts(join(root, "artifacts"));
  if (framework === "foundry") return readFoundryArtifacts(join(root, "out"));
  throw new ArtifactsNotFound({ dir: root });
};
