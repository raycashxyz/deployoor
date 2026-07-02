import { describe, it, expect, vi } from "vitest";
import { runAfterCompile } from "../src/runner";

describe("runAfterCompile", () => {
  it("does not call generate when disabled", async () => {
    const generate = vi.fn();
    await runAfterCompile({
      root: "/project",
      enabled: false,
      generate,
      log: { info: () => {}, warn: () => {} },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("runs generate with the project root and reports the file count when enabled", async () => {
    const generate = vi
      .fn()
      .mockResolvedValue([
        { path: "/project/deployers/Counter.ts" },
        { path: "/project/deployers/index.ts" },
      ]);
    const info = vi.fn();
    await runAfterCompile({ root: "/project", enabled: true, generate, log: { info, warn: () => {} } });

    expect(generate).toHaveBeenCalledWith({ root: "/project" });
    expect(info).toHaveBeenCalledWith("deployoor: generated 2 deployer file(s)");
  });

  it("reports but does not rethrow when generate fails, so hardhat compile still succeeds", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("no deployoor.config found"));
    const warn = vi.fn();

    await expect(
      runAfterCompile({ root: "/project", enabled: true, generate, log: { info: () => {}, warn } }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("deployoor: skipped generate — no deployoor.config found");
  });
});
