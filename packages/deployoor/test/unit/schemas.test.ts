import { describe, it, expect } from "vitest";
import { DeploymentRecord, AddressSchema, BytecodeSchema, HexSchema } from "../../src/schemas";

const valid = {
  contractName: "Token",
  deploymentName: "Token",
  address: "0x1111111111111111111111111111111111111111",
  chainId: 8453,
  networkName: "base",
  abi: [],
  bytecode: "0x60",
  constructorArgs: [],
  transactionHash: "0xabc",
  deployer: "0x2222222222222222222222222222222222222222",
  deployedAt: 1_719_000_000,
  compiler: { version: "0.8.27" },
};

describe("DeploymentRecord schema", () => {
  it("accepts a well-formed record and defaults kind to 'standard'", () => {
    const parsed = DeploymentRecord.parse(valid);

    expect(parsed.contractName).toBe("Token");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.kind).toBe("standard");
  });

  it("rejects an invalid address with a useful issue path", () => {
    const result = DeploymentRecord.safeParse({ ...valid, address: "0xnope" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("address"))).toBe(true);
    }
  });

  it("rejects a non-positive chainId", () => {
    const result = DeploymentRecord.safeParse({ ...valid, chainId: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts unlinked library bytecode and a libraries map (a library-linked deployment)", () => {
    const parsed = DeploymentRecord.parse({
      ...valid,
      bytecode: "0x6080__$f2b8c1a0d3e4f5061728394a5b6c7d8e9f$__",
      libraries: { MathLib: "0x" + "cd".repeat(20) },
    });
    expect(parsed.bytecode).toContain("__$"); // placeholder survives the round-trip through fsStore.read
    expect(parsed.libraries?.MathLib).toBe("0x" + "cd".repeat(20));
  });

  it("defaults history to an empty array for a legacy (v1) record", () => {
    const parsed = DeploymentRecord.parse(valid);
    expect(parsed.history).toEqual([]);
  });

  it("accepts a v2 record with codeHash, identityHash and a descriptive history entry", () => {
    const idHash = `0x${"ab".repeat(32)}` as const;
    const parsed = DeploymentRecord.parse({
      ...valid,
      schemaVersion: 2,
      codeHash: idHash,
      identityHash: idHash,
      history: [
        {
          at: 1_719_000_000,
          address: valid.address,
          transactionHash: "0xdeadbeef",
          deployer: valid.deployer,
          identityHash: idHash,
          reason: {
            kind: "changed",
            changes: [{ field: "code" }, { field: "args", from: [1], to: [2], changedIndices: [0] }],
          },
          summary: "contract bytecode changed",
        },
      ],
    });

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.identityHash).toBe(idHash);
    expect(parsed.history[0]?.reason.kind).toBe("changed");
  });

  it("re-parses a persisted library add/remove history entry (absent from/to, not '0x')", () => {
    const parsed = DeploymentRecord.parse({
      ...valid,
      schemaVersion: 2,
      history: [
        {
          at: 1,
          address: valid.address,
          transactionHash: "0x",
          deployer: valid.deployer,
          reason: {
            kind: "changed",
            changes: [{ field: "library", name: "MathLib", to: "0x" + "cd".repeat(20) }],
          },
          summary: "library `MathLib` added at 0x…",
        },
      ],
    });
    expect(parsed.history[0]?.reason.kind).toBe("changed");
  });
});

describe("AddressSchema", () => {
  it("accepts a 20-byte hex address", () => {
    expect(AddressSchema.safeParse("0x" + "ab".repeat(20)).success).toBe(true);
  });

  it("rejects a too-short address", () => {
    expect(AddressSchema.safeParse("0xabcd").success).toBe(false);
  });
});

describe("BytecodeSchema", () => {
  const withPlaceholder = "0x6080__$f2b8c1a0d3e4f5061728394a5b6c7d8e9f$__";

  it("accepts plain hex bytecode", () => {
    expect(BytecodeSchema.safeParse("0x6080604052").success).toBe(true);
  });

  it("accepts bytecode carrying an unlinked library placeholder", () => {
    expect(BytecodeSchema.safeParse(withPlaceholder).success).toBe(true);
  });

  it("does not loosen the strict HexSchema validator (tx hashes still reject placeholders)", () => {
    expect(HexSchema.safeParse(withPlaceholder).success).toBe(false);
  });
});
