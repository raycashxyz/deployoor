import { describe, it, expect } from "vitest";
import { DeploymentRecord, Address, Bytecode, Hex } from "../../src/schemas";

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
});

describe("Address schema", () => {
  it("accepts a 20-byte hex address", () => {
    expect(Address.safeParse("0x" + "ab".repeat(20)).success).toBe(true);
  });

  it("rejects a too-short address", () => {
    expect(Address.safeParse("0xabcd").success).toBe(false);
  });
});

describe("Bytecode schema", () => {
  const withPlaceholder = "0x6080__$f2b8c1a0d3e4f5061728394a5b6c7d8e9f$__";

  it("accepts plain hex bytecode", () => {
    expect(Bytecode.safeParse("0x6080604052").success).toBe(true);
  });

  it("accepts bytecode carrying an unlinked library placeholder", () => {
    expect(Bytecode.safeParse(withPlaceholder).success).toBe(true);
  });

  it("does not loosen the strict Hex validator (tx hashes still reject placeholders)", () => {
    expect(Hex.safeParse(withPlaceholder).success).toBe(false);
  });
});
