import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Chain } from "viem";
import { defineConfig, defineDeployer, defineRegister, defineReset } from "../../src/index";
import { networkKeyForChain } from "../../src/store";
import { counterArtifact } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

const network = (chain: Chain | undefined): string => {
  if (chain === undefined) throw new Error("client missing chain");
  return networkKeyForChain(chain);
};

// Exercises the actual user flow: `deployoor generate` would emit a file equivalent to
//   export const getOrDeployCounter = defineDeployer(counterArtifact, config)
// and the user calls it with a viem client. No createDeployer, no store wiring.
describe("defineDeployer (the generated-deployer entry point)", () => {
  it("deploys with just a viem client and writes a record to the configured path", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const getOrDeployCounter = defineDeployer(counterArtifact, defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const counter = await getOrDeployCounter({ walletClient, publicClient, args: [42n, account] });

    expect(await counter.read.count()).toBe(42n);
    const chainDir = join(deploymentsPath, network(walletClient.chain));
    expect(existsSync(join(chainDir, "Counter.json"))).toBe(true);
  });

  it("is idempotent across separate deployer calls sharing the config path", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const getOrDeployCounter = defineDeployer(counterArtifact, defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const first = await getOrDeployCounter({ walletClient, publicClient, args: [1n, account] });
    const before = await publicClient.getTransactionCount({ address: account });
    const second = await getOrDeployCounter({ walletClient, publicClient, args: [1n, account] });
    const after = await publicClient.getTransactionCount({ address: account });

    expect(second.address).toBe(first.address);
    expect(after).toBe(before);
  });
});

describe("defineRegister / defineReset (project-level entry points)", () => {
  it("register records an external contract with no transaction and returns its viem object", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const before = await publicClient.getTransactionCount({ address: account });
    const usdc = await register({
      walletClient,
      publicClient,
      deploymentName: "USDC",
      address: account,
      abi: counterArtifact.abi,
    });
    const after = await publicClient.getTransactionCount({ address: account });

    expect(usdc.address).toBe(account);
    expect(after).toBe(before); // recorded, not deployed — no tx
    const chainDir = join(deploymentsPath, network(walletClient.chain));
    expect(existsSync(join(chainDir, "USDC.json"))).toBe(true);
  });

  it("reset forgets a recorded deployment so the next getOrDeploy redeploys", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const config = defineConfig({ deploymentsPath });
    const getOrDeployCounter = defineDeployer(counterArtifact, config);
    const reset = defineReset(config);

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient };
    const chainDir = join(deploymentsPath, network(walletClient.chain));

    const first = await getOrDeployCounter({ ...clients, args: [1n, account] });
    expect(existsSync(join(chainDir, "Counter.json"))).toBe(true);

    await reset({ publicClient, deploymentName: "Counter" }); // reset needs only a public client — no signer
    expect(existsSync(join(chainDir, "Counter.json"))).toBe(false);

    const second = await getOrDeployCounter({ ...clients, args: [1n, account] });
    expect(second.address).not.toBe(first.address); // record gone → fresh deploy
  });

  it("register refuses to overwrite a real deployment", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const config = defineConfig({ deploymentsPath });
    const getOrDeployCounter = defineDeployer(counterArtifact, config);
    const register = defineRegister(config);

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient };
    await getOrDeployCounter({ ...clients, args: [1n, account] }); // real deployment named "Counter"

    await expect(
      register({ ...clients, name: "Counter", address: account, abi: counterArtifact.abi }),
    ).rejects.toThrow(/already exists/);
  });

  it("register updates a prior registration without error", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient };
    await register({ ...clients, name: "USDC", address: account, abi: counterArtifact.abi });
    const again = await register({ ...clients, name: "USDC", address: account, abi: counterArtifact.abi });
    expect(again.address).toBe(account); // re-registering an external record is allowed
  });
});
