import { describe, it, expect } from "vitest";
import { concatHex, keccak256, numberToHex } from "viem";
import type { Abi, Hex } from "viem";
import { codeHash, computeIdentity, stripMetadata } from "../../src/engine/identity";

// Build a runtime blob = <code><cbor metadata><2-byte big-endian length>, the layout solc emits.
// `numberToHex(n, { size: 2 })` is the length field; hand-rolling it as .toString(16).padStart(4)
// is the same bytes with the width invariant left implicit.
const withTrailer = (code: string, cbor: string): Hex =>
  concatHex([`0x${code}`, `0x${cbor}`, numberToHex(cbor.length / 2, { size: 2 })]);

const CODE = "6080604052348015";
const runtimeA = withTrailer(CODE, "a2010203");
const runtimeB = withTrailer(CODE, "a2fffefd"); // identical code, different metadata, same length
const runtimeOtherCode = withTrailer("6080604052348099", "a2010203");

const CTOR_ABI = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "start", type: "uint256" },
      { name: "owner", type: "address" },
    ],
  },
] as const satisfies Abi;

const addrA = `0x${"11".repeat(20)}` as const;
const addrB = `0x${"22".repeat(20)}` as const;

describe("stripMetadata", () => {
  it("removes the trailing CBOR metadata", () => {
    expect(stripMetadata(runtimeA)).toBe(`0x${CODE}`);
  });

  it("leaves bytecode without a metadata trailer unchanged", () => {
    const plain = "0x6080604052" as const;
    expect(stripMetadata(plain)).toBe(plain);
  });

  it("leaves bytecode unchanged when the trailing length points at a non-CBOR byte", () => {
    const coincidental = "0x112233440002" as const; // length says 2, but byte before it is 0x33, not CBOR
    expect(stripMetadata(coincidental)).toBe(coincidental);
  });

  it("returns short values unchanged", () => {
    expect(stripMetadata("0x")).toBe("0x");
    expect(stripMetadata("0x60")).toBe("0x60");
  });

  it("leaves bytecode whose tail is an unlinked library placeholder unchanged", () => {
    // An unlinked artifact is not valid hex. Those bytes can never be a metadata length, and
    // parsing them as one throws — which would break the diff path that documents itself as total.
    const unlinked = "0x6080__$f2b8c1a0d3e4f5061728394a5b6c7d8e9f$__" as const;
    expect(stripMetadata(unlinked)).toBe(unlinked);
  });

  it("strips the trailer from creation bytecode too (solc appends it to both)", () => {
    // The v1-record path compares creation bytecode, which carries the same CBOR trailer.
    const creation = withTrailer(`${CODE}f3fe${CODE}`, "a2010203");
    expect(stripMetadata(creation)).toBe(`0x${CODE}f3fe${CODE}`);
  });
});

describe("codeHash", () => {
  it("ignores a metadata-only difference (same code, different CBOR trailer)", () => {
    expect(codeHash(runtimeA)).toBe(codeHash(runtimeB));
  });

  it("differs when the runtime code itself changes", () => {
    expect(codeHash(runtimeA)).not.toBe(codeHash(runtimeOtherCode));
  });

  it("is the keccak of the stripped bytes, so it can be checked against on-chain code", () => {
    expect(codeHash(runtimeA)).toBe(keccak256(`0x${CODE}`));
  });

  it("is undefined for unlinked bytecode rather than silently hashing the placeholder text", () => {
    // viem's keccak256 does not reject non-hex — it falls through to hashing the string — so
    // without this guard the field would mean two different things.
    expect(codeHash("0x6080__$f2b8c1a0d3e4f5061728394a5b6c7d8e9f$__")).toBeUndefined();
  });
});

describe("computeIdentity", () => {
  it("is stable for identical code, args and libraries", () => {
    const a = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeA, args: [5n, addrA] });
    const b = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeA, args: [5n, addrA] });
    expect(a.identityHash).toBe(b.identityHash);
  });

  it("is unchanged by a metadata-only recompile (the no-redeploy case)", () => {
    const a = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeA, args: [5n, addrA] });
    const b = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeB, args: [5n, addrA] });
    expect(b.identityHash).toBe(a.identityHash);
    expect(b.codeHash).toBe(a.codeHash);
  });

  it("changes when a constructor argument changes", () => {
    const a = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeA, args: [5n, addrA] });
    const b = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeA, args: [6n, addrA] });
    expect(b.identityHash).not.toBe(a.identityHash);
    expect(b.codeHash).toBe(a.codeHash); // code unchanged, only args moved
  });

  it("changes when the runtime code changes", () => {
    const a = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeA, args: [5n, addrA] });
    const b = computeIdentity({ abi: CTOR_ABI, deployedBytecode: runtimeOtherCode, args: [5n, addrA] });
    expect(b.identityHash).not.toBe(a.identityHash);
  });

  it("changes when a linked library address changes", () => {
    const base = { abi: [] as unknown as Abi, deployedBytecode: runtimeA, args: [] as const };
    const a = computeIdentity({ ...base, libraries: { MathLib: addrA } });
    const b = computeIdentity({ ...base, libraries: { MathLib: addrB } });
    expect(b.identityHash).not.toBe(a.identityHash);
  });

  it("handles a contract with no constructor and no libraries", () => {
    const identity = computeIdentity({ abi: [] as unknown as Abi, deployedBytecode: runtimeA, args: [] });
    expect(identity.identityHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
