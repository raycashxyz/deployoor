import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import generateAfterCompile from "../src/v3-compile-action";

// The plugin object (src/v3.ts) calls `overrideTask` from hardhat/config, which only exists at
// runtime on Hardhat 3 — so it's exercised by examples/hardhat-v3's e2e (real Hardhat 3), not
// here. This unit covers the compile-override *action*, which has no Hardhat dependency.
describe("@deployoor/hardhat/v3 compile action", () => {
  it("runs the real compile (runSuper) first, then regenerates, passing through the compile result", async () => {
    const order: string[] = [];
    const runSuper = vi.fn(async () => {
      order.push("compile");
      return "compiled";
    });
    // A temp dir with no deployoor.config → generation fails, but runAfterCompile swallows it
    // (a deployoor misconfig must never break `hardhat compile`). We still assert compile ran.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => order.push("generate-attempted"));
    const root = mkdtempSync(join(tmpdir(), "deployoor-hh3-"));

    const result = await generateAfterCompile({}, { config: { paths: { root } } }, runSuper);

    expect(runSuper).toHaveBeenCalledOnce();
    expect(result).toBe("compiled"); // the compile result is returned unchanged
    expect(order[0]).toBe("compile"); // compile happens before generation is attempted
    warn.mockRestore();
  });
});
