import { describe, it, expect, vi, beforeAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, PublicClient, WalletClient } from "viem";
import { createDeployer, defineReset } from "../../src/engine/deployer";
import { memoryStore, fsStore, networkKeyForChain } from "../../src/store";
import { counterArtifact, COUNTER_DEPLOYED_BYTECODE } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

let account: Address;
let walletClient: WalletClient;
let publicClient: PublicClient;
beforeAll(async () => {
  ({ address: account, walletClient, publicClient } = await makeEvmClients());
});
const chainInfo = () => {
  const chain = walletClient.chain;
  if (chain === undefined) throw new Error("walletClient missing chain");
  return chain;
};
const network = () => networkKeyForChain(chainInfo());

// Same deployable creation bytecode as Counter, but a different runtime → different code identity.
const changedCode = {
  ...counterArtifact,
  deployedBytecode: `0x7f${COUNTER_DEPLOYED_BYTECODE.slice(4)}` as `0x${string}`,
};
// Two artifacts whose runtime differs ONLY in the trailing metadata (same code, same length).
const metaA = { ...counterArtifact, deployedBytecode: "0x6080604052348015a20102030004" as `0x${string}` };
const metaB = { ...counterArtifact, deployedBytecode: "0x6080604052348015a2ffeedd0004" as `0x${string}` };

describe("redeploymentStrategy: on-change (default)", () => {
  it("redeploys with a new address when the runtime code changes", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    const first = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "OC1" });
    const second = await deployer.getOrDeploy(changedCode, { args: [5n, account], deploymentName: "OC1" });

    expect(second.freshDeploy).toBe(true);
    expect(second.contract.address).not.toBe(first.contract.address);
    expect(second.deployment.history).toHaveLength(2);
    expect(second.deployment.history?.[1]?.reason).toMatchObject({ kind: "changed" });
    expect(second.deployment.history?.[1]?.supersededAddress).toBe(first.contract.address);
  });

  it("reuses (no redeploy) when only the metadata trailer changed", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    const first = await deployer.getOrDeploy(metaA, { args: [5n, account], deploymentName: "OC2" });
    const second = await deployer.getOrDeploy(metaB, { args: [5n, account], deploymentName: "OC2" });

    expect(first.freshDeploy).toBe(true);
    expect(second.freshDeploy).toBe(false);
    expect(second.contract.address).toBe(first.contract.address);
  });

  it("redeploys when a constructor arg changes, and names it in the reason summary", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "OC3" });
    const second = await deployer.getOrDeploy(counterArtifact, {
      args: [6n, account],
      deploymentName: "OC3",
    });

    expect(second.freshDeploy).toBe(true);
    const last = second.deployment.history?.[1];
    expect(last?.summary).toContain("constructor args changed");
    expect(last?.summary).toContain("arg 1 `start`");
  });
});

describe("redeploymentStrategy: always / never", () => {
  it("'always' redeploys even when nothing changed (reason: forced)", async () => {
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      redeploymentStrategy: "always",
    });

    const first = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "AL1" });
    const second = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "AL1",
    });

    expect(second.freshDeploy).toBe(true);
    expect(second.contract.address).not.toBe(first.contract.address);
    expect(second.deployment.history?.[1]?.reason.kind).toBe("forced");
  });

  it("'never' reuses even when the code changed", async () => {
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      redeploymentStrategy: "never",
    });

    const first = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "NV1" });
    const second = await deployer.getOrDeploy(changedCode, { args: [9n, account], deploymentName: "NV1" });

    expect(second.freshDeploy).toBe(false);
    expect(second.contract.address).toBe(first.contract.address);
  });

  it("applies a per-chain strategy override from redeploymentStrategyByChainId", async () => {
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      redeploymentStrategyByChainId: { [chainInfo().id]: "never" },
    });

    await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "PC1" });
    const second = await deployer.getOrDeploy(changedCode, { args: [5n, account], deploymentName: "PC1" });

    expect(second.freshDeploy).toBe(false); // never, because this chain is pinned
  });
});

describe("deprecated force option", () => {
  it("maps force:true → 'always' (redeploy + deprecation warning) and force:false → 'never'", async () => {
    const warn = vi.fn();
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      deps: { log: { info: () => {}, warn } },
    });

    const first = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "FC1" });
    const forced = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "FC1",
      force: true,
    });
    const kept = await deployer.getOrDeploy(counterArtifact, {
      args: [7n, account],
      deploymentName: "FC1",
      force: false,
    });

    expect(forced.freshDeploy).toBe(true);
    expect(forced.contract.address).not.toBe(first.contract.address);
    expect(kept.freshDeploy).toBe(false); // force:false → 'never' → reuse despite the arg change
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("deprecated");
  });
});

describe("dependency cascade", () => {
  it("redeploys a dependent when its dependency's address (a constructor arg) changes", async () => {
    const store = memoryStore();
    const deployer = createDeployer({ walletClient, publicClient, store });

    const tokenA = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Token",
    });
    const vaultA = await deployer.getOrDeploy(counterArtifact, {
      args: [0n, tokenA.contract.address],
      deploymentName: "Vault",
    });

    // Redeploy the dependency with changed code → new address.
    const tokenB = await deployer.getOrDeploy(changedCode, { args: [5n, account], deploymentName: "Token" });
    expect(tokenB.contract.address).not.toBe(tokenA.contract.address);

    // The dependent, fed the dependency's new address, redeploys because its arg moved.
    const vaultB = await deployer.getOrDeploy(counterArtifact, {
      args: [0n, tokenB.contract.address],
      deploymentName: "Vault",
    });
    expect(vaultB.freshDeploy).toBe(true);
    expect(vaultB.contract.address).not.toBe(vaultA.contract.address);
  });
});

describe("verification sources sidecar", () => {
  it("writes <Name>.sources.json with the standard-json input on a fresh deploy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const deployer = createDeployer({ walletClient, publicClient, store: fsStore(dir) });

    await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "Side1" });

    const file = join(dir, network(), "Side1.sources.json");
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.fullyQualifiedName).toBe("src/Counter.sol:Counter");
    expect(parsed.standardJsonInput.sources["src/Counter.sol"]).toBeDefined();
  });

  it("does not rewrite the sidecar on a reuse", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const deployer = createDeployer({ walletClient, publicClient, store: fsStore(dir) });

    await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "Side2" });
    const file = join(dir, network(), "Side2.sources.json");
    rmSync(file);

    const reused = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Side2",
    });
    expect(reused.freshDeploy).toBe(false);
    expect(existsSync(file)).toBe(false); // reuse wrote nothing back
  });

  it("reset removes both the record and its sidecar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const store = fsStore(dir);
    const deployer = createDeployer({ walletClient, publicClient, store });

    await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "Side3" });
    expect(existsSync(join(dir, network(), "Side3.sources.json"))).toBe(true);

    await defineReset({})({ publicClient, deploymentName: "Side3", store });

    expect(existsSync(join(dir, network(), "Side3.json"))).toBe(false);
    expect(existsSync(join(dir, network(), "Side3.sources.json"))).toBe(false);
  });
});

describe("v1 record migration", () => {
  it("reuses an unchanged v1 record, then upgrades it to v2 with history on redeploy", async () => {
    const v1 = {
      schemaVersion: 1 as const,
      contractName: "Counter",
      deploymentName: "V1",
      address: "0x00000000000000000000000000000000000000c0" as const,
      chainId: chainInfo().id,
      networkName: network(),
      abi: counterArtifact.abi,
      bytecode: counterArtifact.bytecode,
      constructorArgs: [5n, account],
      transactionHash: "0x" as const,
      deployer: account,
      deployedAt: 0,
      compiler: { version: "0.8.35" },
      kind: "standard" as const,
    };
    const store = memoryStore([v1]);
    const deployer = createDeployer({ walletClient, publicClient, store });

    const reused = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "V1" });
    expect(reused.freshDeploy).toBe(false); // v1 fallback: creation bytecode + args unchanged

    const redeployed = await deployer.getOrDeploy(counterArtifact, {
      args: [8n, account],
      deploymentName: "V1",
    });
    expect(redeployed.freshDeploy).toBe(true);
    expect(redeployed.deployment.schemaVersion).toBe(2);
    expect(redeployed.deployment.history?.[0]?.reason.kind).toBe("changed");
  });
});
