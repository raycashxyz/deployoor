import {
  concatHex,
  encodeDeployData,
  getAddress,
  hexToNumber,
  isHex,
  keccak256,
  size,
  slice,
  stringToBytes,
} from "viem";
import type { Abi, Hex } from "viem";
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

// Artifact bytecode is not always valid hex: an unlinked library reference is a literal
// `__$<34 hex>$__` placeholder. Such bytes can never be a metadata trailer, and handing them to
// hexToNumber throws — so every trailing-byte read is guarded, keeping stripMetadata total.
const byteValue = (bytes: Hex): number | undefined =>
  /^0x[0-9a-fA-F]+$/.test(bytes) ? hexToNumber(bytes) : undefined;

/**
 * Drop solc's trailing CBOR metadata (`<cbor map><2-byte big-endian length>`) from bytecode, so a
 * comment-only recompile — which changes only the embedded metadata hash — is not read as a code
 * change. Applies to runtime and creation bytecode alike (solc appends the trailer to both).
 * Returns the input untouched when there is no recognizable trailer (`bytecodeHash: "none"`,
 * `appendCBOR: false`, a link placeholder in the tail, or non-solc output).
 */
export const stripMetadata = (bytecode: Hex): Hex => {
  const bytes = size(bytecode);
  if (bytes < 2) return bytecode;
  const declaredLength = byteValue(slice(bytecode, bytes - 2));
  if (declaredLength === undefined) return bytecode;
  const trailer = declaredLength + 2;
  if (trailer > bytes) return bytecode;
  const cborStart = bytes - trailer;
  const marker = byteValue(slice(bytecode, cborStart, cborStart + 1));
  // CBOR "map" major type (0xa1–0xbf; solc emits 0xa1–0xa3). Anything else means the trailing
  // two bytes were a coincidence, not a metadata length — leave the bytecode alone. Biasing
  // toward under-stripping is deliberate: over-stripping could make two different contracts
  // hash equal and silently skip a real redeploy.
  if (marker === undefined || marker < 0xa1 || marker > 0xbf) return bytecode;
  return slice(bytecode, 0, cborStart);
};

/**
 * keccak of the metadata-stripped runtime code — the "is the compiled code the same?" key, and
 * the `codeHash` a record stores.
 *
 * `undefined` for an artifact whose runtime bytecode still holds unlinked `__$…$__` library
 * placeholders. That is deliberate: `keccak256` does not reject non-hex input, it silently falls
 * through to hashing the *text* (viem's `toBytes` → `stringToBytes`), which would give the field
 * two different meanings depending on whether the contract links a library. One meaning — keccak
 * of the real runtime bytes — or absent.
 */
export const codeHash = (deployedBytecode: Hex): Hex | undefined => {
  const code = stripMetadata(deployedBytecode);
  return isHex(code, { strict: true }) ? keccak256(code) : undefined;
};

// viem owns constructor-arg encoding: an empty bytecode makes encodeDeployData return just the
// ABI-encoded args, reusing viem's own arg/constructor validation.
const encodeConstructorArgs = (abi: Abi, args: readonly unknown[]): Hex =>
  encodeDeployData({ abi, bytecode: "0x", args });

// Fold linked library addresses in by name, so a changed library address — invisible in the
// unlinked placeholder bytecode — still moves the identity. Sorted for determinism.
const encodeLibraries = (libraries: Libraries): Hex => {
  const entries = Object.entries(libraries).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0
    ? "0x"
    : concatHex(
        entries.map(([name, address]) => concatHex([keccak256(stringToBytes(name)), getAddress(address)])),
      );
};

export interface Identity {
  /** keccak of the metadata-stripped runtime code; absent when the bytecode is still unlinked. */
  readonly codeHash?: Hex;
  /** keccak of (code ++ constructor args ++ libraries) — the full redeploy key. */
  readonly identityHash: Hex;
}

/**
 * Compute a deployment's identity from live values (never from a record's re-parsed JSON).
 * Throws only when viem cannot encode the constructor args against the abi — the same
 * condition that makes the deploy itself impossible; the pipeline lifts that into a tagged error.
 */
export const computeIdentity = (input: {
  readonly abi: Abi;
  readonly deployedBytecode: Hex;
  readonly args: readonly unknown[];
  readonly libraries?: Libraries;
}): Identity => {
  const code = stripMetadata(input.deployedBytecode);
  const parts = [code, encodeConstructorArgs(input.abi, input.args), encodeLibraries(input.libraries ?? {})];
  // `identityHash` is an internal redeploy key that is only ever compared against another
  // identityHash, so text-hashing unlinked bytecode is harmless here — unlike `codeHash`, which
  // is published in the record and therefore has to mean one thing.
  const hash = codeHash(input.deployedBytecode);
  return {
    ...(hash === undefined ? {} : { codeHash: hash }),
    identityHash: keccak256(concatHex(parts)),
  };
};
