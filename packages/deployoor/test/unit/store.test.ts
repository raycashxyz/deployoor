import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fsStore, networkKeyForChain } from "../../src/store";
import { counterArtifact } from "../fixtures";

const record = (root: string) => ({
  schemaVersion: 1 as const,
  contractName: "Counter",
  deploymentName: "Counter",
  address: "0x00000000000000000000000000000000000000c0" as const,
  chainId: 42161,
  networkName: "42161-arbitrum-one",
  abi: counterArtifact.abi,
  bytecode: counterArtifact.bytecode,
  constructorArgs: [],
  transactionHash: "0x" as const,
  deployer: "0x000000000000000000000000000000000000dead" as const,
  deployedAt: 0,
  compiler: { version: "0.8.35" },
  kind: "standard" as const,
  root,
});

describe("networkKeyForChain", () => {
  it("uses chainId plus a filesystem-safe chain slug", () => {
    expect(networkKeyForChain({ id: 42161, name: "Arbitrum One" })).toBe("42161-arbitrum-one");
  });
});

describe("fsStore", () => {
  it("writes records atomically under the network key", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-store-"));
    const store = fsStore(root);
    const { root: _root, ...deployment } = record(root);

    await store.write(deployment);

    expect(existsSync(join(root, "42161-arbitrum-one", "Counter.json"))).toBe(true);
    expect(await store.read("42161-arbitrum-one", "Counter")).toMatchObject({
      schemaVersion: 1,
      deploymentName: "Counter",
    });
  });

  it("rejects unsafe deployment names before touching paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-store-"));
    const store = fsStore(root);
    const { root: _root, ...deployment } = record(root);

    expect(() => store.write({ ...deployment, deploymentName: "../Counter" })).toThrow(/path separators/);
  });

  it("skips invalid json records when listing a network", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-store-"));
    const store = fsStore(root);
    const { root: _root, ...deployment } = record(root);
    await store.write(deployment);
    writeFileSync(join(root, "42161-arbitrum-one", "bad.json"), "{ nope");

    expect(await store.list("42161-arbitrum-one")).toHaveLength(1);
  });

  it("round-trips a v2 record's history, identityHash and deployedBytecode (bigint args stay portable)", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-store-"));
    const store = fsStore(root);
    const { root: _root, ...base } = record(root);
    const idHash = ("0x" + "ab".repeat(32)) as `0x${string}`;

    await store.write({
      ...base,
      schemaVersion: 2,
      deployedBytecode: "0x6080",
      identityHash: idHash,
      history: [
        {
          at: 1,
          address: base.address,
          transactionHash: "0x",
          deployer: base.deployer,
          identityHash: idHash,
          reason: {
            kind: "changed",
            changes: [{ field: "args", from: [1n], to: [2n], changedIndices: [0] }],
          },
          summary: "constructor args changed",
        },
      ],
    });

    const read = await store.read("42161-arbitrum-one", "Counter");
    expect(read?.schemaVersion).toBe(2);
    expect(read?.deployedBytecode).toBe("0x6080");
    expect(read?.identityHash).toBe(idHash);
    expect(read?.history?.[0]?.summary).toBe("constructor args changed");
  });
});
