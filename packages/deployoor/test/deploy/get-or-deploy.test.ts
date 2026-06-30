import { describe, it, expect, vi, beforeAll } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, PublicClient, WalletClient } from "viem";
import { definePlugin } from "../../src/index";
import { createDeployer } from "../../src/engine/deployer";
import { memoryStore, fsStore } from "../../src/store";
import { counterArtifact, reverterArtifact, libArtifact } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

// One real in-process EVM shared across the suite; each test gets a fresh store
// (so idempotency is per-test) and a unique deploymentName (so chain state is independent).
let account: Address;
let walletClient: WalletClient;
let publicClient: PublicClient;
beforeAll(async () => {
  ({ address: account, walletClient, publicClient } = await makeEvmClients());
});
const nonce = () => publicClient.getTransactionCount({ address: account });

describe("getOrDeploy", () => {
  it("deploys on the first call and writes a deployment record", async () => {
    const store = memoryStore();
    const deployer = createDeployer({ walletClient, publicClient, store });

    const contract = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_a",
    });

    expect(await contract.read.count()).toBe(5n);
    const record = await store.read(walletClient.chain!.name.toLowerCase(), "Counter_a");
    expect(record?.address).toBe(contract.address);
  });

  it("returns the existing contract with no transaction on the second call", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    const first = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_b",
    });
    const before = await nonce();
    const second = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_b",
    });
    const after = await nonce();

    expect(second.address).toBe(first.address);
    expect(after).toBe(before);
  });

  it("redeploys (new address, new tx) when force is true", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    const first = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_c",
    });
    const before = await nonce();
    const second = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_c",
      force: true,
    });
    const after = await nonce();

    expect(second.address).not.toBe(first.address);
    expect(after).toBe(before + 1);
  });

  it("fails with LibrariesUnlinked when a required library is missing", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    await expect(deployer.getOrDeploy(libArtifact, { args: [] })).rejects.toMatchObject({
      _tag: "LibrariesUnlinked",
      missing: ["MathLib"],
    });
  });

  it("fails with DeploymentFailed when the on-chain deploy reverts", async () => {
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore() });

    await expect(
      deployer.getOrDeploy(reverterArtifact, { args: [], deploymentName: "Reverter_a" }),
    ).rejects.toMatchObject({ _tag: "DeploymentFailed", contract: "Reverter_a" });
  });

  it("calls onContractDeployed with the deployment, receipt and metadata", async () => {
    const onContractDeployed = vi.fn();
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      plugins: [definePlugin({ name: "spy", onContractDeployed })],
    });

    const contract = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_d",
    });

    expect(onContractDeployed).toHaveBeenCalledOnce();
    expect(onContractDeployed).toHaveBeenCalledWith(
      expect.objectContaining({
        reused: false,
        deployment: expect.objectContaining({ address: contract.address }),
        receipt: expect.objectContaining({ contractAddress: contract.address }),
        metadata: expect.objectContaining({ fullyQualifiedName: "src/Counter.sol:Counter" }),
      }),
      expect.anything(),
    );
  });

  it("does not abort the deploy when a plugin throws (default warn)", async () => {
    const warn = vi.fn();
    const boom = definePlugin({
      name: "boom",
      onContractDeployed: () => {
        throw new Error("kaboom");
      },
    });
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      plugins: [boom],
      deps: { log: { info: () => {}, warn } },
    });

    const contract = await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_e",
    });

    expect(await contract.read.count()).toBe(5n);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("surfaces PluginFailed when onPluginError is 'throw' (deployment still recorded)", async () => {
    const store = memoryStore();
    const boom = definePlugin({
      name: "boom",
      onContractDeployed: () => {
        throw new Error("verify failed");
      },
    });
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store,
      plugins: [boom],
      deps: { log: { info: () => {}, warn: () => {} } },
      onPluginError: "throw",
    });

    await expect(
      deployer.getOrDeploy(counterArtifact, { args: [5n, account], deploymentName: "Counter_f" }),
    ).rejects.toMatchObject({ _tag: "PluginFailed", plugins: ["boom"] });
    expect(await store.read(walletClient.chain!.name.toLowerCase(), "Counter_f")).not.toBeNull();
  });

  it("skips a plugin for this deploy when plugins[name] is false", async () => {
    const onContractDeployed = vi.fn();
    const etherscan = definePlugin({ name: "etherscan", onContractDeployed });
    const deployer = createDeployer({
      walletClient,
      publicClient,
      store: memoryStore(),
      plugins: [etherscan],
    });

    await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_g",
      plugins: { etherscan: false },
    });

    expect(onContractDeployed).not.toHaveBeenCalled();
  });

  it("merges per-deploy plugin options into ctx.options", async () => {
    const onContractDeployed = vi.fn();
    const slack = definePlugin<"slack", { message?: string }>({ name: "slack", onContractDeployed });
    const deployer = createDeployer({ walletClient, publicClient, store: memoryStore(), plugins: [slack] });

    await deployer.getOrDeploy(counterArtifact, {
      args: [5n, account],
      deploymentName: "Counter_h",
      plugins: { slack: { message: "live" } },
    });

    expect(onContractDeployed).toHaveBeenCalledWith(
      expect.objectContaining({ options: { message: "live" } }),
      expect.anything(),
    );
  });

  it("persists bigint constructor args as vanilla, portable JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deployoor-"));
    const deployer = createDeployer({ walletClient, publicClient, store: fsStore(dir) });

    const big = 123_456_789_012_345_678_901_234_567_890n;
    await deployer.getOrDeploy(counterArtifact, { args: [big, account], deploymentName: "Counter_i" });

    const parsed = JSON.parse(
      readFileSync(join(dir, walletClient.chain!.name.toLowerCase(), "Counter_i.json"), "utf8"),
    );
    expect(parsed.address).toMatch(/^0x/);
    expect(parsed.abi).toBeInstanceOf(Array);
    expect(parsed.constructorArgs[0]).toBe(big.toString());
  });
});
