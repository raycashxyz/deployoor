import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { concatHex, slice, type Hex } from "viem";
import { createDeployer, defineReset } from "../../src/engine/deployer";
import { memoryStore, fsStore, networkKeyForChain } from "../../src/store";
import { counterArtifact, COUNTER_DEPLOYED_BYTECODE } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

// Top-level await, so the clients are plain `const` rather than `let` filled in by a hook.
const { address: account, walletClient, publicClient } = await makeEvmClients();
const chainInfo = () => {
  const chain = walletClient.chain;
  if (chain === undefined) throw new Error("walletClient missing chain");
  return chain;
};
const network = () => networkKeyForChain(chainInfo());

// Same deployable creation bytecode as Counter, but a different first runtime byte → different
// code identity. `slice` counts bytes, so this says "replace byte 0" rather than "drop 4 chars".
const changedCode = {
  ...counterArtifact,
  deployedBytecode: concatHex(["0x7f", slice(COUNTER_DEPLOYED_BYTECODE, 1)]),
};
// Two artifacts whose runtime differs ONLY in the trailing metadata (same code, same length).
const metaA = { ...counterArtifact, deployedBytecode: "0x6080604052348015a20102030004" } as const;
const metaB = { ...counterArtifact, deployedBytecode: "0x6080604052348015a2ffeedd0004" } as const;

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

describe("per-call strategy", () => {
  it("overrides the config default for a single deploy, in both directions", async () => {
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      redeploymentStrategy: "never",
    });

    const first = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "PS1" });
    const forced = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "PS1",
      redeploymentStrategy: "always", // beats the config's 'never'
    });
    const kept = await deployer.getOrDeploy(counterArtifact, {
      args: [7n, account],
      deploymentName: "PS1", // no override → config's 'never' → reuse despite the arg change
    });

    expect(forced.freshDeploy).toBe(true);
    expect(forced.contract.address).not.toBe(first.contract.address);
    expect(kept.freshDeploy).toBe(false);
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

describe("verification sources", () => {
  const sourcesFile = (dir: string, record: { readonly sourcesHash?: string }): string => {
    if (record.sourcesHash === undefined) throw new Error("record has no sourcesHash");
    return join(dir, "sources", `${record.sourcesHash}.json`);
  };

  it("pins the standard-json input at sources/<hash>.json and points the record at it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const deployer = createDeployer({ walletClient, publicClient, store: fsStore(dir) });

    const { deployment } = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Side1",
    });

    const file = sourcesFile(dir, deployment);
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    expect(parsed.fullyQualifiedName).toBe("src/Counter.sol:Counter");
    expect(parsed.standardJsonInput.sources["src/Counter.sol"]).toBeDefined();
  });

  it("stores one blob for two deployments sharing a compilation input", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const deployer = createDeployer({ walletClient, publicClient, store: fsStore(dir) });

    const first = await deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "ShA" });
    const second = await deployer.getOrDeploy(counterArtifact, {
      args: [6n, account],
      deploymentName: "ShB",
    });

    expect(second.deployment.sourcesHash).toBe(first.deployment.sourcesHash);
    expect(readdirSync(join(dir, "sources"))).toHaveLength(1);
  });

  it("does not rewrite the pinned sources on a reuse", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const deployer = createDeployer({ walletClient, publicClient, store: fsStore(dir) });

    const { deployment } = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Side2",
    });
    const file = sourcesFile(dir, deployment);
    rmSync(file);

    const reused = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Side2",
    });
    expect(reused.freshDeploy).toBe(false);
    expect(existsSync(file)).toBe(false); // reuse wrote nothing back
  });

  it("reset removes the record and collects its now-unreferenced sources", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const store = fsStore(dir);
    const deployer = createDeployer({ walletClient, publicClient, store });

    const { deployment } = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Side3",
    });
    expect(existsSync(sourcesFile(dir, deployment))).toBe(true);

    await defineReset({})({ publicClient, deploymentName: "Side3", store });

    expect(existsSync(join(dir, network(), "Side3.json"))).toBe(false);
    expect(existsSync(sourcesFile(dir, deployment))).toBe(false);
  });

  it("still records the deployment when pinning the sources fails", async () => {
    // The deploy is already broadcast and confirmed by this point, so a store that cannot pin
    // sources must not turn a successful deployment into a rejected promise.
    const warn = vi.fn();
    const failing = {
      ...memoryStore(),
      writeSources: () => {
        throw new Error("disk full");
      },
    };
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: failing,
      deps: { log: { info: () => {}, warn } },
    });

    expect(await failing.read(network(), "PinFail")).toBeNull();

    const { freshDeploy, deployment } = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "PinFail",
    });

    expect(freshDeploy).toBe(true);
    // Assert the persisted record, not just the returned one: the value the pipeline resolves with
    // is the record it built in memory, so it looks identical whether or not the write happened.
    const persisted = await failing.read(network(), "PinFail");
    expect(persisted?.address).toBe(deployment.address);
    // No sourcesHash, rather than a hash pointing at a blob that was never written.
    expect(persisted?.sourcesHash).toBeUndefined();
    expect(deployment.sourcesHash).toBeUndefined();
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("could not pin");
  });

  it("reset keeps a sources blob another deployment still references", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-sidecar-"));
    const store = fsStore(dir);
    const deployer = createDeployer({ walletClient, publicClient, store });

    const kept = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "KeepA",
    });
    await deployer.getOrDeploy(counterArtifact, { args: [6n, account], deploymentName: "KeepB" });

    await defineReset({})({ publicClient, deploymentName: "KeepB", store });

    expect(existsSync(join(dir, network(), "KeepA.json"))).toBe(true);
    expect(existsSync(sourcesFile(dir, kept.deployment))).toBe(true); // KeepA still points at it
  });
});

describe("v1 record migration", () => {
  const v1Record = (name: string, bytecode: Hex = counterArtifact.bytecode) => ({
    schemaVersion: 1 as const,
    contractName: "Counter",
    deploymentName: name,
    address: "0x00000000000000000000000000000000000000c0" as const,
    chainId: chainInfo().id,
    networkName: network(),
    abi: counterArtifact.abi,
    bytecode,
    constructorArgs: [5n, account],
    transactionHash: "0x" as const,
    deployer: account,
    deployedAt: 0,
    compiler: { version: "0.8.35" },
    kind: "standard" as const,
  });

  it("reuses an unchanged v1 record, then upgrades it to v2 with history on redeploy", async () => {
    const store = memoryStore([v1Record("V1")]);
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

  it("does not redeploy a v1 record after a comment-only recompile", async () => {
    // The upgrade hazard: a v1 record has no identityHash, so the decision falls back to comparing
    // creation bytecode — which carries solc's metadata hash. Left unstripped, adopting the
    // 'on-change' default would redeploy every pre-existing contract on the first run.
    const recompiled = counterArtifact.bytecode.replace(
      "122049266f280ff0d3ac",
      "1220ffffffffffffffff",
    ) as Hex;
    expect(recompiled).not.toBe(counterArtifact.bytecode); // guard: the trailer really moved

    const store = memoryStore([v1Record("V1Meta")]);
    const deployer = createDeployer({ walletClient, publicClient, store });

    const reused = await deployer.getOrDeploy(
      { ...counterArtifact, bytecode: recompiled },
      { args: [5n, account], deploymentName: "V1Meta" },
    );
    expect(reused.freshDeploy).toBe(false);
    expect(reused.contract.address).toBe("0x00000000000000000000000000000000000000c0");
  });
});
