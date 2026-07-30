import { keccak256, stringToBytes } from "viem";
import type { Hex } from "viem";
import type { ContractMetadata, SourcesSidecar } from "../schemas";

/**
 * The verification sources pinned at deploy time, addressed by content.
 *
 * A standard-json input is the whole compilation unit — every source file — so the same contract
 * deployed to six chains would mean six identical multi-hundred-KB blobs in the user's repo. Naming
 * the blob after its own hash collapses those to one: records across chains (and across contracts
 * that share a compilation unit) point at the same file via `sourcesHash`, and a redeploy that
 * recompiles nothing rewrites nothing.
 *
 * The hash is a dedup key, not a security digest: it is taken over the serialized sidecar, so a
 * compiler that emits `sources` in a different key order simply produces a second, equivalent blob.
 */
export interface PinnedSources {
  readonly hash: Hex;
  readonly sidecar: SourcesSidecar;
}

export const pinSources = (metadata: ContractMetadata): PinnedSources => {
  const sidecar: SourcesSidecar = {
    schemaVersion: 1,
    fullyQualifiedName: metadata.fullyQualifiedName,
    compilerVersion: metadata.compilerVersion,
    standardJsonInput: metadata.standardJsonInput,
  };
  return { hash: keccak256(stringToBytes(JSON.stringify(sidecar))), sidecar };
};
