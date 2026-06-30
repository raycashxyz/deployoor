import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";
import { ArtifactsNotFound } from "../errors";
import { AbiSchema, Hex } from "../schemas";
import type { Artifact } from "../schemas";
import { toArtifact, isDeployable, type LinkReferences } from "./parse";

// Zod-validated boundary shapes for Hardhat's on-disk artifacts.
const LinkRefs = z.record(
  z.string(),
  z.record(z.string(), z.array(z.object({ start: z.number(), length: z.number() }))),
);
const ArtifactFile = z.object({
  contractName: z.string(),
  sourceName: z.string(),
  abi: AbiSchema,
  bytecode: Hex,
  linkReferences: LinkRefs.optional(),
});
const Dbg = z.object({ buildInfo: z.string() });
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

const readBuildInfo = (artifactFile: string): z.infer<typeof BuildInfo> | undefined => {
  const dbgPath = artifactFile.replace(/\.json$/, ".dbg.json");
  if (!existsSync(dbgPath)) return undefined;
  const dbg = Dbg.safeParse(JSON.parse(readFileSync(dbgPath, "utf8")));
  if (!dbg.success) return undefined;
  const info = BuildInfo.safeParse(
    JSON.parse(readFileSync(join(dirname(dbgPath), dbg.data.buildInfo), "utf8")),
  );
  return info.success ? info.data : undefined;
};

/** Read a Hardhat project's compiled artifacts into deployoor Artifacts. */
export const readHardhatArtifacts = (artifactsDir: string): Artifact[] => {
  if (!existsSync(artifactsDir)) throw new ArtifactsNotFound({ dir: artifactsDir });

  return jsonFiles(artifactsDir).flatMap((file) => {
    const parsed = ArtifactFile.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success || !isDeployable(parsed.data.bytecode)) return [];

    const info = readBuildInfo(file);
    return [
      toArtifact({
        name: parsed.data.contractName,
        sourceName: parsed.data.sourceName,
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
