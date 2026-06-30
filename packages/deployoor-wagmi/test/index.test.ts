import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readDeploymentContracts, deployments } from "../src/index";

const deploymentsDir = join(import.meta.dirname, "fixtures", "deployments");

const find = (contracts: ReturnType<typeof readDeploymentContracts>, name: string) => {
  const contract = contracts.find((c) => c.name === name);
  if (!contract) throw new Error(`expected a "${name}" contract`);
  return contract;
};

describe("readDeploymentContracts", () => {
  it("emits one contract per deployment name", () => {
    const contracts = readDeploymentContracts(deploymentsDir);
    expect(contracts.map((c) => c.name).sort()).toEqual(["Counter", "Token"]);
  });

  it("folds the same deployment across chains into one multi-chain address map", () => {
    const counter = find(readDeploymentContracts(deploymentsDir), "Counter");
    expect(counter.address).toEqual({
      8453: "0x00000000000000000000000000000000000000c0",
      11155111: "0x0000000000000000000000000000000000005e90",
    });
  });

  it("carries the abi through unchanged", () => {
    const counter = find(readDeploymentContracts(deploymentsDir), "Counter");
    expect((counter.abi as readonly { name?: string }[]).map((e) => e.name)).toEqual(["number", "increment"]);
  });

  it("keeps a single-chain deployment as a single-key address map", () => {
    const token = find(readDeploymentContracts(deploymentsDir), "Token");
    expect(token.address).toEqual({ 8453: "0x0000000000000000000000000000000000000700" });
  });

  it("skips json files that are not deployment records", () => {
    // _unrelated.json sits beside the records; a valid run yields only the 2 real ones.
    expect(readDeploymentContracts(deploymentsDir)).toHaveLength(2);
  });

  it("returns nothing for a missing folder", () => {
    expect(readDeploymentContracts(join(deploymentsDir, "does-not-exist"))).toEqual([]);
  });
});

describe("deployments plugin", () => {
  it("exposes a named @wagmi/cli plugin sourcing the deployments folder", () => {
    const plugin = deployments({ path: deploymentsDir });
    expect(plugin.name).toBe("deployoor-deployments");
    expect(plugin.contracts?.()).toEqual(readDeploymentContracts(deploymentsDir));
  });

  it("defaults to ./deployments when no path is given", () => {
    expect(deployments().contracts?.()).toEqual([]); // nothing at cwd/./deployments in test
  });
});
