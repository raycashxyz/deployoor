import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Artifact } from "../schemas";
import { artifactModule, deployerModule, indexModule } from "./templates";

export interface GenerateOptions {
  /** Directory the deployer + types files are written into (e.g. "./deployers"). */
  readonly outDir: string;
  /** Import specifier from a generated deployer file to the user's deployoor config. */
  readonly configImport: string;
  /** The runtime package generated deployers import. Default "deployoor". */
  readonly packageName?: string;
}

export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

/**
 * Emit the generated deployer tree from a list of artifacts. Framework-agnostic:
 * the artifacts come from the Hardhat/Foundry adapters (next slice); this is the
 * write side, exercised directly with a fixture artifact list.
 */
export const generate = (
  artifacts: ReadonlyArray<Artifact>,
  opts: GenerateOptions,
): ReadonlyArray<GeneratedFile> => {
  const packageName = opts.packageName ?? "deployoor";
  const typesDir = join(opts.outDir, "types");
  mkdirSync(typesDir, { recursive: true });

  const written: GeneratedFile[] = [];
  const emit = (path: string, contents: string): void => {
    writeFileSync(path, contents);
    written.push({ path, contents });
  };

  artifacts.forEach((artifact) => {
    emit(join(typesDir, `${artifact.name}.ts`), artifactModule(artifact, packageName));
    emit(
      join(opts.outDir, `${artifact.name}.ts`),
      deployerModule(artifact, { packageName, configImport: opts.configImport }),
    );
  });
  emit(join(opts.outDir, "index.ts"), indexModule(artifacts.map((a) => a.name)));

  return written;
};
