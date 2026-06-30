import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ArtifactsNotFound } from "../errors";
import { AbiSchema, Hex } from "../schemas";
import type { Artifact } from "../schemas";
import { toArtifact, isDeployable, type LinkReferences } from "./parse";

// Zod-validated boundary shapes for Foundry's `out/` artifacts. Note bytecode is
// nested under `.object` (unlike Hardhat's flat string), and the fully-qualified
// name comes from `metadata.settings.compilationTarget`.
const LinkRefs = z.record(
  z.string(),
  z.record(z.string(), z.array(z.object({ start: z.number(), length: z.number() }))),
);
const ArtifactFile = z.object({
  abi: AbiSchema,
  bytecode: z.object({ object: Hex, linkReferences: LinkRefs.optional() }),
  metadata: z.object({
    compiler: z.object({ version: z.string() }),
    settings: z.object({ compilationTarget: z.record(z.string(), z.string()) }),
  }),
});
const BuildInfo = z.object({
  input: z.object({
    sources: z.record(z.string(), z.object({ content: z.string() })),
    settings: z.record(z.string(), z.unknown()),
  }),
});

const jsonFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "build-info" ? [] : jsonFiles(full);
    return full.endsWith(".json") ? [full] : [];
  });

/** Foundry has no per-artifact build-info link; find the input whose sources include this contract. */
const buildInfoInputFor = (
  outDir: string,
  sourcePath: string,
): z.infer<typeof BuildInfo>["input"] | undefined => {
  const dir = join(outDir, "build-info");
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => BuildInfo.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8"))))
    .map((r) => (r.success ? r.data.input : undefined))
    .find((input) => input !== undefined && sourcePath in input.sources);
};

/** Read a Foundry project's `out/` artifacts into deployoor Artifacts. */
export const readFoundryArtifacts = (outDir: string): Artifact[] => {
  if (!existsSync(outDir)) throw new ArtifactsNotFound({ dir: outDir });

  return jsonFiles(outDir).flatMap((file) => {
    const parsed = ArtifactFile.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success || !isDeployable(parsed.data.bytecode.object)) return [];

    const target = Object.entries(parsed.data.metadata.settings.compilationTarget)[0];
    if (target === undefined) return [];
    const [sourceName, contractName] = target;

    const input = buildInfoInputFor(outDir, sourceName);
    return [
      toArtifact({
        name: contractName,
        sourceName,
        abi: parsed.data.abi,
        bytecode: parsed.data.bytecode.object,
        linkReferences: parsed.data.bytecode.linkReferences as LinkReferences | undefined,
        compilerVersion: parsed.data.metadata.compiler.version,
        sources: input?.sources ?? {},
        settings: input?.settings ?? {},
      }),
    ];
  });
};
