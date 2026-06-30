import { describe, it, expect } from "vitest";
import { DeploymentRecord, Address } from "../../src/schemas";

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
});

describe("Address schema", () => {
  it("accepts a 20-byte hex address", () => {
    expect(Address.safeParse("0x" + "ab".repeat(20)).success).toBe(true);
  });

  it("rejects a too-short address", () => {
    expect(Address.safeParse("0xabcd").success).toBe(false);
  });
});
