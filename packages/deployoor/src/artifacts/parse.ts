import { keccak256, stringToBytes } from "viem";
import type { Abi } from "viem";
import type { Artifact } from "../schemas";

/** solc link references: sourceName → libName → byte positions in the bytecode. */
export type LinkReferences = Record<string, Record<string, ReadonlyArray<{ start: number; length: number }>>>;

/**
 * Compute the `__$<placeholder>$__` library placeholders solc emits into bytecode.
 * The placeholder is the first 17 bytes (34 hex chars) of keccak256("<source>:<Lib>").
 */
export const libraryPlaceholders = (linkReferences: LinkReferences): Record<string, string> =>
  Object.fromEntries(
    Object.entries(linkReferences).flatMap(([sourceName, libs]) =>
      Object.keys(libs).map(
        (libName) => [libName, keccak256(stringToBytes(`${sourceName}:${libName}`)).slice(2, 36)] as const,
      ),
    ),
  );

export interface RawCompiled {
  readonly name: string;
  readonly sourceName: string;
  readonly abi: Abi;
  readonly bytecode: `0x${string}`;
  readonly linkReferences?: LinkReferences;
  readonly compilerVersion: string;
  readonly sources: Record<string, { content: string }>;
  readonly settings: Record<string, unknown>;
}

/** Normalize a framework-agnostic compiled contract into a deployoor Artifact. */
export const toArtifact = (raw: RawCompiled): Artifact => ({
  name: raw.name,
  abi: raw.abi,
  bytecode: raw.bytecode,
  metadata: {
    fullyQualifiedName: `${raw.sourceName}:${raw.name}`,
    compilerVersion: raw.compilerVersion,
    standardJsonInput: { language: "Solidity", sources: raw.sources, settings: raw.settings },
    libraryPlaceholders: libraryPlaceholders(raw.linkReferences ?? {}),
  },
});

/** Interfaces/abstract contracts compile to empty bytecode — they get no deployer. */
export const isDeployable = (bytecode: string): boolean => bytecode !== "0x" && bytecode.length > 2;
