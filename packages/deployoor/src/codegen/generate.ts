import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Artifact } from "../schemas";
import type { ResolvedImportExtension } from "../config";
import { artifactModule, deployerModule, indexModule } from "./templates";

export interface GenerateOptions {
  /** Directory the deployer + types files are written into (e.g. "./deployers"). */
  readonly outDir: string;
  /**
   * Import specifier from a generated deployer file to the user's deployoor config. Omitted when
   * the project has no config file, in which case the deployers carry the defaults inline.
   */
  readonly configImport?: string;
  /** The runtime package generated deployers import. Default "deployoor". */
  readonly packageName?: string;
  /**
   * Extension on emitted relative specifiers. Default "none" — the caller (`runGenerate`) resolves
   * the project's `'auto'` setting before it gets here, so codegen stays a pure function of it.
   */
  readonly importExtension?: ResolvedImportExtension;
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
  const importExtension = opts.importExtension ?? "none";
  const typesDir = join(opts.outDir, "types");
  mkdirSync(typesDir, { recursive: true });

  // Write and describe in one step, so the returned manifest is the `.map` of what was emitted
  // rather than an accumulator the loop has to keep in sync with the writes.
  const emit = (path: string, contents: string): GeneratedFile => {
    writeFileSync(path, contents);
    return { path, contents };
  };

  return [
    ...artifacts.flatMap((artifact) => [
      emit(join(typesDir, `${artifact.name}.ts`), artifactModule(artifact, packageName)),
      emit(
        join(opts.outDir, `${artifact.name}.ts`),
        deployerModule(artifact, { packageName, configImport: opts.configImport, importExtension }),
      ),
    ]),
    emit(
      join(opts.outDir, "index.ts"),
      indexModule(
        artifacts.map((a) => a.name),
        { packageName, configImport: opts.configImport, importExtension },
      ),
    ),
  ];
};
