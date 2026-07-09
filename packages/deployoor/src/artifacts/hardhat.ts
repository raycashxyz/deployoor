import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";
import { ArtifactsNotFound } from "../errors";
import { AbiSchema, Bytecode } from "../schemas";
import type { Artifact } from "../schemas";
import { toArtifact, isDeployable, type LinkReferences } from "./parse";

// Zod-validated boundary shapes for Hardhat's on-disk artifacts. This one reader covers
// BOTH Hardhat majors: the per-contract fields (contractName/sourceName/abi/bytecode/
// linkReferences) are identical across Hardhat 2 (`_format: hh-sol-artifact-1`) and
// Hardhat 3 (`hh3-artifact-1`) — bytecode is a flat `0x` string in both. Only the link to
// the build-info differs: HH2 writes a sibling `<Name>.dbg.json` pointing at the build-info
// file; HH3 carries the build-info id inline as `buildInfoId` and drops `.dbg.json`.
const LinkRefs = z.record(
  z.string(),
  z.record(z.string(), z.array(z.object({ start: z.number(), length: z.number() }))),
);
const ArtifactFile = z.object({
  contractName: z.string(),
  sourceName: z.string(),
  abi: AbiSchema,
  bytecode: Bytecode,
  linkReferences: LinkRefs.optional(),
  // Hardhat 3 additions (optional, so HH2 artifacts still parse):
  buildInfoId: z.string().optional(),
  // The source name solc actually used — may differ from the on-disk `sourceName` for
  // npm/remapped imports. It is the key under `input.sources`, so verification's
  // fully-qualified name must use it when present.
  inputSourceName: z.string().optional(),
});
// HH2 debug sidecar: `<Name>.dbg.json` → the build-info path, relative to the .dbg file.
const Dbg = z.object({ buildInfo: z.string() });
// Build-info standard-json input. Same shape in HH2 (`hh-sol-build-info-1`) and HH3
// (`hh3-sol-build-info-1`, which splits the solc *output* into a sibling `.output.json`
// we never need): the solc long version plus the standard-json `input` used for verification.
const BuildInfo = z.object({
  solcLongVersion: z.string(),
  input: z.object({
    sources: z.record(z.string(), z.object({ content: z.string() })),
    settings: z.record(z.string(), z.unknown()),
  }),
});

const jsonFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "build-info" ? [] : jsonFiles(full);
    return full.endsWith(".json") && !full.endsWith(".dbg.json") ? [full] : [];
  });

const readParsedBuildInfo = (path: string): z.infer<typeof BuildInfo> | undefined => {
  if (!existsSync(path)) return undefined;
  const info = BuildInfo.safeParse(JSON.parse(readFileSync(path, "utf8")));
  return info.success ? info.data : undefined;
};

/**
 * Resolve one artifact's standard-json build-info, covering both Hardhat majors:
 *  - HH3: the artifact carries `buildInfoId`; the file is `<artifactsDir>/build-info/<id>.json`.
 *  - HH2: follow the sibling `<Name>.dbg.json` → its `buildInfo` relative path.
 */
const readBuildInfo = (
  artifactsDir: string,
  artifactFile: string,
  buildInfoId: string | undefined,
): z.infer<typeof BuildInfo> | undefined => {
  if (buildInfoId !== undefined) {
    return readParsedBuildInfo(join(artifactsDir, "build-info", `${buildInfoId}.json`));
  }
  const dbgPath = artifactFile.replace(/\.json$/, ".dbg.json");
  if (!existsSync(dbgPath)) return undefined;
  const dbg = Dbg.safeParse(JSON.parse(readFileSync(dbgPath, "utf8")));
  if (!dbg.success) return undefined;
  return readParsedBuildInfo(join(dirname(dbgPath), dbg.data.buildInfo));
};

/** Read a Hardhat project's compiled artifacts (v2 or v3) into deployoor Artifacts. */
export const readHardhatArtifacts = (artifactsDir: string): Artifact[] => {
  if (!existsSync(artifactsDir)) throw new ArtifactsNotFound({ dir: artifactsDir });

  return jsonFiles(artifactsDir).flatMap((file) => {
    const parsed = ArtifactFile.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success || !isDeployable(parsed.data.bytecode)) return [];

    const info = readBuildInfo(artifactsDir, file, parsed.data.buildInfoId);
    return [
      toArtifact({
        name: parsed.data.contractName,
        // Prefer HH3's `inputSourceName` (the key under `input.sources`) so the verification
        // fully-qualified name matches the compiled source path; fall back to `sourceName`.
        sourceName: parsed.data.inputSourceName ?? parsed.data.sourceName,
        abi: parsed.data.abi,
        bytecode: parsed.data.bytecode,
        linkReferences: parsed.data.linkReferences as LinkReferences | undefined,
        compilerVersion: info?.solcLongVersion ?? "",
        sources: info?.input.sources ?? {},
        settings: info?.input.settings ?? {},
      }),
    ];
  });
};
