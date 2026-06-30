import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, defineDeployer } from "../../src/index";
import { counterArtifact } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

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
    const chainDir = join(deploymentsPath, walletClient.chain!.name.toLowerCase());
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
