import {
  concatHex,
  encodeDeployData,
  getAddress,
  hexToNumber,
  keccak256,
  size,
  slice,
  stringToBytes,
} from "viem";
import type { Abi } from "viem";
import type { Libraries } from "../schemas";

/**
 * The deploy identity: what actually lands on-chain. Two deployments are "the same"
 * exactly when their identity matches, so `getOrDeploy`'s `on-change` strategy redeploys
 * iff the identity moved. It is deliberately NOT the source — sources, comments, and
 * settings affect the identity only through the runtime bytecode, which is what we compare:
 *
 *   identity = keccak(stripMetadata(runtime code) ++ encoded constructor args ++ libraries)
 *
 * Every component is computed from live values, so neither the compare nor the stored
 * `identityHash` ever re-encodes constructor args out of a record's JSON — which is what
 * keeps bigint/checksum/representation drift from ever forcing a spurious redeploy.
 */

/**
 * Drop solc's trailing CBOR metadata (`<cbor map><2-byte big-endian length>`) from runtime
 * bytecode, so a comment-only recompile — which changes only the embedded metadata hash — is
 * not read as a code change. Returns the input untouched when there is no recognizable trailer
 * (e.g. `settings.metadata.bytecodeHash: "none"`, or non-solc output).
 */
export const stripMetadata = (bytecode: `0x${string}`): `0x${string}` => {
  const bytes = size(bytecode);
  if (bytes < 2) return bytecode;
  const declaredLength = hexToNumber(slice(bytecode, bytes - 2));
  const trailer = declaredLength + 2;
  if (trailer > bytes) return bytecode;
  const cborStart = bytes - trailer;
  const marker = hexToNumber(slice(bytecode, cborStart, cborStart + 1));
  // CBOR "map" major type (0xa1–0xbf; solc emits 0xa1–0xa3). Anything else means the trailing
  // two bytes were a coincidence, not a metadata length — leave the bytecode alone. Biasing
  // toward under-stripping is deliberate: over-stripping could make two different contracts
  // hash equal and silently skip a real redeploy.
  if (marker < 0xa1 || marker > 0xbf) return bytecode;
  return slice(bytecode, 0, cborStart);
};

/** keccak of the metadata-stripped runtime code — the "is the compiled code the same?" key. */
export const codeHash = (deployedBytecode: `0x${string}`): `0x${string}` =>
  keccak256(stripMetadata(deployedBytecode));

// viem owns constructor-arg encoding: an empty bytecode makes encodeDeployData return just the
// ABI-encoded args, reusing viem's own arg/constructor validation.
const encodeConstructorArgs = (abi: Abi, args: readonly unknown[]): `0x${string}` =>
  encodeDeployData({ abi, bytecode: "0x", args });

// Fold linked library addresses in by name, so a changed library address — invisible in the
// unlinked placeholder bytecode — still moves the identity. Sorted for determinism.
const encodeLibraries = (libraries: Libraries): `0x${string}` => {
  const entries = Object.entries(libraries).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0
    ? "0x"
    : concatHex(
        entries.map(([name, address]) => concatHex([keccak256(stringToBytes(name)), getAddress(address)])),
      );
};

export interface Identity {
  /** keccak of the metadata-stripped runtime code. */
  readonly codeHash: `0x${string}`;
  /** keccak of (code ++ constructor args ++ libraries) — the full redeploy key. */
  readonly identityHash: `0x${string}`;
}

/**
 * Compute a deployment's identity from live values (never from a record's re-parsed JSON).
 * Throws only when viem cannot encode the constructor args against the abi — the same
 * condition that makes the deploy itself impossible; the pipeline lifts that into a tagged error.
 */
export const computeIdentity = (input: {
  readonly abi: Abi;
  readonly deployedBytecode: `0x${string}`;
  readonly args: readonly unknown[];
  readonly libraries?: Libraries;
}): Identity => {
  const code = stripMetadata(input.deployedBytecode);
  const parts = [code, encodeConstructorArgs(input.abi, input.args), encodeLibraries(input.libraries ?? {})];
  return { codeHash: keccak256(code), identityHash: keccak256(concatHex(parts)) };
};
