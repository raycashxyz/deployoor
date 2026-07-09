import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectFramework } from "../../src/artifacts/detect";
import { readArtifactsAsync } from "../../src/artifacts";
import { readTevmArtifacts } from "../../src/artifacts/tevm";

// The real compile path (@tevm/compiler + solc) is exercised end-to-end by examples/tevm's
// `e2e` script; these cover detection + dispatch, which need no optional dep.
describe("tevm framework detection + dispatch", () => {
  it("detects tevm from a tevm.config.* marker (no Hardhat/Foundry output present)", () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-tevm-"));
    writeFileSync(join(root, "tevm.config.ts"), "export default {}\n");
    expect(detectFramework(root)).toBe("tevm");
  });

  it("routes framework:'tevm' and reports missing sources before importing the compiler", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-tevm-"));
    // No src/ dir → ArtifactsNotFound, thrown before the optional @tevm/compiler is loaded.
    await expect(readArtifactsAsync(root, { framework: "tevm" })).rejects.toThrow(/No compiled artifacts/);
  });

  it("throws ArtifactsNotFound when the sources dir has no .sol files", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-tevm-"));
    await expect(readTevmArtifacts(root, { sources: "contracts" })).rejects.toThrow(/No compiled artifacts/);
  });
});
