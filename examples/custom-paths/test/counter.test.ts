import { describe, it, expect } from "vitest";
import { createTestClients } from "@deployoor/testing";
// `generated/deployers`, not `deployers` — this project sets `out` in deployoor.config.ts.
import { getOrDeployCounter } from "../generated/deployers";

describe("custom paths", () => {
  it("deploys a contract compiled into build/artifacts, with no artifactsPath configured", async () => {
    // The point of the example: deployoor found `build/artifacts` by reading `paths.artifacts` out of
    // hardhat.config.js. Nothing in deployoor.config.ts mentions it, and this deploy reads the
    // bytecode from there at call time.
    const clients = await createTestClients();

    const { contract: counter, freshDeploy } = await getOrDeployCounter({ ...clients, args: [7n] });

    expect(freshDeploy).toBe(true);
    expect(await counter.read.number()).toBe(7n);
    await counter.write.increment();
    expect(await counter.read.number()).toBe(8n);
  });
});
