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
 * Read the compiled artifacts. Deliberately **not** memoised.
 *
 * An earlier version cached the scan per project for the life of the process, which turned out to
 * cost more than it saved. It reintroduced staleness on the one path the abi check cannot see: a
 * process that resolves, recompiles, then resolves again would deploy the *old* bytecode and pin the
 * *old* sources, silently, because only the abi is compared and the abi had not changed. That
 * contradicts the premise of the whole design, which is that bytecode is read fresh from disk.
 *
 * It also cached rejected promises, so a resolve that ran before anything was compiled poisoned every
 * later resolve in that process even after compilation succeeded.
 *
 * The saving did not justify either. Measured on the test fixture, a full scan is **0.47 ms**; even a
 * large project's parse is single-digit milliseconds, against a deploy that spends seconds on network
 * round trips. If this ever does show up, the fix is a targeted read of one artifact by
 * fully-qualified name rather than a cache that can go stale.
 */
const loadArtifacts = async (
  root: string,
  opts: ResolveArtifactOptions,
): Promise<ReadonlyArray<Artifact>> => {
  // Imported dynamically so the main `deployoor` entry — which generated deployers import — does not
  // statically pull in the Node-only artifact readers (and, for tevm, a Solidity compiler). A deploy
  // that passes a full artifact never loads any of it. Same reasoning as the `deployoor/generate`
  // subpath existing at all.
  const mod = await import("./index");
  return mod.readArtifactsAsync(root, {
    framework: opts.framework,
    artifactsPath: opts.artifactsPath,
    sources: opts.sources,
  });
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
