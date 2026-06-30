import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "../../src/codegen/generate";
import { counterArtifact } from "../fixtures";

const run = () => {
  const outDir = mkdtempSync(join(tmpdir(), "deployoor-gen-"));
  generate([counterArtifact], { outDir, configImport: "../deployoor.config" });
  return outDir;
};

describe("generate (codegen)", () => {
  it("emits a typed artifact module, a deployer, and an index", () => {
    const outDir = run();
    expect(existsSync(join(outDir, "types", "Counter.ts"))).toBe(true);
    expect(existsSync(join(outDir, "Counter.ts"))).toBe(true);
    expect(existsSync(join(outDir, "index.ts"))).toBe(true);
  });

  it("emits a self-contained artifact module (abi as const, type-only deployoor import)", () => {
    const mod = readFileSync(join(run(), "types", "Counter.ts"), "utf8");
    expect(mod).toContain('import type { TypedArtifact } from "deployoor"');
    expect(mod).toContain("as const");
    expect(mod).toContain("satisfies TypedArtifact<typeof abi>");
    expect(mod).toContain('"increment"'); // the real abi was serialized in
  });

  it("emits a deployer that wires defineDeployer with the config and artifact", () => {
    const mod = readFileSync(join(run(), "Counter.ts"), "utf8");
    expect(mod).toContain('import { defineDeployer } from "deployoor"');
    expect(mod).toContain('import config from "../deployoor.config"');
    expect(mod).toContain("export const getOrDeployCounter = defineDeployer(counterArtifact, config)");
  });

  it("emits an index of explicit named exports, never export *", () => {
    const idx = readFileSync(join(run(), "index.ts"), "utf8");
    expect(idx).toContain('export { getOrDeployCounter } from "./Counter";');
    expect(idx).not.toContain("export *");
  });
});
