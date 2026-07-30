import { describe, it, expect } from "vitest";
import type { Abi } from "viem";
import { codeHash, computeIdentity, stripMetadata } from "../../src/engine/identity";

// Build a runtime blob = <code><cbor metadata><2-byte big-endian length>, the layout solc emits.
const withTrailer = (code: string, cbor: string): `0x${string}` => {
  const lengthHex = (cbor.length / 2).toString(16).padStart(4, "0");
  return `0x${code}${cbor}${lengthHex}`;
};

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
});

describe("codeHash", () => {
  it("ignores a metadata-only difference (same code, different CBOR trailer)", () => {
    expect(codeHash(runtimeA)).toBe(codeHash(runtimeB));
  });

  it("differs when the runtime code itself changes", () => {
    expect(codeHash(runtimeA)).not.toBe(codeHash(runtimeOtherCode));
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
