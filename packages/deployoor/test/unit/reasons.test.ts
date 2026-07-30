import { describe, it, expect } from "vitest";
import { diffIdentity, renderSummary } from "../../src/engine/reasons";
import type { DeploymentRecord, RedeployReason } from "../../src/schemas";
import { codeHash } from "../../src/engine/identity";
import { COUNTER_ABI } from "../fixtures";

const addrA = `0x${"11".repeat(20)}` as const;
const addrB = `0x${"22".repeat(20)}` as const;
const depA = "0x6080604052a20102030004" as const; // code + 4-byte cbor metadata + length
const depMutated = "0x7f80604052a20102030004" as const; // same trailer, first code byte changed

const existing = (over: Partial<DeploymentRecord> = {}): DeploymentRecord => ({
  schemaVersion: 2,
  contractName: "Counter",
  deploymentName: "Counter",
  address: addrA,
  chainId: 8453,
  networkName: "8453-base",
  abi: COUNTER_ABI,
  bytecode: "0x6080aa",
  codeHash: codeHash(depA),
  constructorArgs: [5n, addrA],
  transactionHash: "0x",
  deployer: addrA,
  deployedAt: 0,
  compiler: { version: "0.8.35" },
  kind: "standard",
  ...over,
});

describe("diffIdentity", () => {
  it("returns no changes when code, args and libraries match", () => {
    const changes = diffIdentity({
      existing: existing(),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: {},
    });
    expect(changes).toEqual([]);
  });

  it("flags a code change when the metadata-stripped runtime differs", () => {
    const changes = diffIdentity({
      existing: existing(),
      abi: COUNTER_ABI,
      bytecode: "0x6080bb",
      deployedBytecode: depMutated,
      args: [5n, addrA],
      libraries: {},
    });
    expect(changes).toContainEqual({ field: "code" });
  });

  it("flags a constructor-arg change with the changed index", () => {
    const changes = diffIdentity({
      existing: existing(),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [6n, addrA],
      libraries: {},
    });
    expect(changes).toContainEqual(expect.objectContaining({ field: "args", changedIndices: [0] }));
  });

  it("ignores bigint-vs-string representation drift (record stores '5', call passes 5n)", () => {
    const changes = diffIdentity({
      existing: existing({ constructorArgs: ["5", addrA] }),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: {},
    });
    expect(changes).toEqual([]);
  });

  it("flags a library-address change", () => {
    const changes = diffIdentity({
      existing: existing({ libraries: { MathLib: addrA } }),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: { MathLib: addrB },
    });
    expect(changes).toContainEqual(expect.objectContaining({ field: "library", name: "MathLib" }));
  });

  it("omits the absent side for an added (no `from`) or removed (no `to`) library", () => {
    const added = diffIdentity({
      existing: existing(),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: { MathLib: addrB },
    });
    expect(added).toContainEqual({ field: "library", name: "MathLib", to: addrB });

    const removed = diffIdentity({
      existing: existing({ libraries: { MathLib: addrA } }),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: {},
    });
    expect(removed).toContainEqual({ field: "library", name: "MathLib", from: addrA });
  });

  it("treats a number, a bigint and a numeric string as the same uint256 arg", () => {
    const keys = [5, 5n, "5"].map((value) =>
      diffIdentity({
        existing: existing({ constructorArgs: [value, addrA] }),
        abi: COUNTER_ABI,
        bytecode: "0x6080aa",
        deployedBytecode: depA,
        args: [5n, addrA],
        libraries: {},
      }),
    );
    expect(keys).toEqual([[], [], []]);
  });

  it("ignores address checksum casing", () => {
    const changes = diffIdentity({
      existing: existing({ constructorArgs: [5n, addrA.toUpperCase().replace("0X", "0x")] }),
      abi: COUNTER_ABI,
      bytecode: "0x6080aa",
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: {},
    });
    expect(changes).toEqual([]);
  });

  it("falls back to creation-bytecode comparison for a v1 record (no codeHash)", () => {
    const v1 = existing({ codeHash: undefined, identityHash: undefined });
    const unchanged = diffIdentity({
      existing: v1,
      abi: COUNTER_ABI,
      bytecode: "0x6080aa", // same creation bytecode as the record
      deployedBytecode: depMutated, // runtime differs, but v1 can't see it → not a change
      args: [5n, addrA],
      libraries: {},
    });
    expect(unchanged).toEqual([]);
    const changed = diffIdentity({
      existing: v1,
      abi: COUNTER_ABI,
      bytecode: "0x6080bb", // creation bytecode differs → code change
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: {},
    });
    expect(changed).toContainEqual({ field: "code" });
  });

  it("does not flag a v1 record when only the creation bytecode's metadata trailer moved", () => {
    // Creation bytecode carries the same trailing CBOR hash as the runtime code, so a
    // comment-only recompile must not redeploy the one class of record that has no identityHash.
    const creationA = "0x6080604052a20102030004" as const;
    const creationB = "0x6080604052a2ffeedd0004" as const;
    const changes = diffIdentity({
      existing: existing({ bytecode: creationA, codeHash: undefined, identityHash: undefined }),
      abi: COUNTER_ABI,
      bytecode: creationB,
      deployedBytecode: depA,
      args: [5n, addrA],
      libraries: {},
    });
    expect(changes).toEqual([]);
  });
});

describe("renderSummary", () => {
  it("renders the fresh / forced / registered reasons", () => {
    expect(renderSummary({ kind: "fresh" }, COUNTER_ABI)).toBe("first deployment");
    expect(renderSummary({ kind: "forced" }, COUNTER_ABI)).toContain("forced");
    expect(renderSummary({ kind: "registered" }, COUNTER_ABI)).toContain("registered");
  });

  it("names changed constructor args using the abi input names and full values", () => {
    const reason: RedeployReason = {
      kind: "changed",
      changes: [{ field: "args", from: [5n, addrA], to: [6n, addrA], changedIndices: [0] }],
    };
    const summary = renderSummary(reason, COUNTER_ABI);
    expect(summary).toContain("constructor args changed from [5,");
    expect(summary).toContain("to [6,");
    expect(summary).toContain("arg 1 `start`"); // COUNTER_ABI's first constructor input is `start`
  });

  it("describes a code change", () => {
    expect(renderSummary({ kind: "changed", changes: [{ field: "code" }] }, COUNTER_ABI)).toBe(
      "contract bytecode changed",
    );
  });

  it("describes an added and a removed library", () => {
    const added: RedeployReason = { kind: "changed", changes: [{ field: "library", name: "L", to: addrB }] };
    const removed: RedeployReason = {
      kind: "changed",
      changes: [{ field: "library", name: "L", from: addrA }],
    };
    expect(renderSummary(added, COUNTER_ABI)).toContain("added");
    expect(renderSummary(removed, COUNTER_ABI)).toContain("removed");
  });
});
