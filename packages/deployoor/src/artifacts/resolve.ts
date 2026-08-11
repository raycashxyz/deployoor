import { resolve as resolvePath } from "node:path";
import type { Abi } from "viem";
import { ContractArtifactNotFound, GeneratedArtifactStale } from "../errors";
import { isFullArtifact, type Artifact, type GeneratedArtifact, type TypedArtifact } from "../schemas";
import { diffAbi } from "./abi-identity";
import type { Framework } from "./detect";

/**
 * Turn what `deployoor generate` emitted into what the deploy pipeline needs.
 *
 * A generated deployer commits only the abi and a fully-qualified name; the bytecode, compiler
 * settings and standard-json input are read from the compiled artifact at deploy time. This module is
 * that seam, and it is also where the abi-drift check lives — deliberately in front of the pipeline,
 * so it runs before constructor args are encoded and before a record is assembled.
 *
 * A full `TypedArtifact` passes straight through. That is what keeps a hand-built or
 * compiled-in-memory artifact working with no filesystem at all, which `@deployoor/testing` and
 * `fhevm-tevm-mocks` both rely on.
 */

export interface ResolveArtifactOptions {
  /** Project root. Defaults to the working directory, which is the documented contract. */
  readonly root?: string;
  readonly framework?: Framework;
  readonly artifactsPath?: string;
  readonly sources?: string;
}

/**
 * Reading artifacts means a directory scan that also parses every build-info, so a script deploying
 * twenty contracts must not pay for it twenty times. Keyed on everything that changes the answer.
 *
 * The promise is cached rather than the result, so concurrent deploys in one script share a single
 * scan instead of racing to start several. A module-level `Map` mutated only by this function is the
 * same shape as `memoryStore`'s own map.
 */
const scans = new Map<string, Promise<ReadonlyArray<Artifact>>>();

const cacheKey = (root: string, opts: ResolveArtifactOptions): string =>
  // JSON rather than a delimiter: a path may contain any character a separator might use, and two
  // different inputs must never collapse to one key.
  JSON.stringify([root, opts.framework, opts.artifactsPath, opts.sources]);

const loadArtifacts = (root: string, opts: ResolveArtifactOptions): Promise<ReadonlyArray<Artifact>> => {
  const key = cacheKey(root, opts);
  const inFlight = scans.get(key);
  if (inFlight !== undefined) return inFlight;

  // Imported dynamically so the main `deployoor` entry — which generated deployers import — does not
  // statically pull in the Node-only artifact readers (and, for tevm, a Solidity compiler). A deploy
  // that passes a full artifact never loads any of it. Same reasoning as the `deployoor/generate`
  // subpath existing at all.
  const scan = import("./index").then((mod) =>
    mod.readArtifactsAsync(root, {
      framework: opts.framework,
      artifactsPath: opts.artifactsPath,
      sources: opts.sources,
    }),
  );
  scans.set(key, scan);
  return scan;
};

/** Drop the memoised scans. For tests, and for a long-lived process that recompiles between deploys. */
export const clearArtifactCache = (): void => {
  scans.clear();
};

export const resolveArtifact = async <A extends Abi>(
  artifact: GeneratedArtifact<A> | TypedArtifact<A>,
  opts: ResolveArtifactOptions = {},
): Promise<TypedArtifact<A>> => {
  if (isFullArtifact(artifact)) return artifact;

  const root = resolvePath(opts.root ?? process.cwd());
  const all = await loadArtifacts(root, opts);
  const compiled = all.find((entry) => entry.metadata.fullyQualifiedName === artifact.fullyQualifiedName);

  if (compiled === undefined) {
    throw new ContractArtifactNotFound({
      fullyQualifiedName: artifact.fullyQualifiedName,
      dir: root,
      available: all.map((entry) => entry.metadata.fullyQualifiedName),
    });
  }

  const drift = diffAbi(artifact.abi, compiled.abi);
  if (drift.added.length > 0 || drift.removed.length > 0) {
    throw new GeneratedArtifactStale({
      fullyQualifiedName: artifact.fullyQualifiedName,
      added: drift.added,
      removed: drift.removed,
    });
  }

  // The generated abi is used rather than the compiled one purely so the precise literal type `A`
  // survives without a cast. The check above proved the two describe the same interface, so the
  // record still documents the interface actually deployed; only key order or an `internalType`
  // spelling could differ, and neither carries meaning.
  return { ...compiled, abi: artifact.abi };
};
