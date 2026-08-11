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

/** A project with no deployoor.config.* at all — every option left at its default. */
const runWithoutConfig = () => {
  const outDir = mkdtempSync(join(tmpdir(), "deployoor-gen-noconfig-"));
  generate([counterArtifact], { outDir });
  return outDir;
};

describe("generate (codegen)", () => {
  it("emits a typed artifact module, a deployer, and an index", () => {
    const outDir = run();
    expect(existsSync(join(outDir, "types", "Counter.ts"))).toBe(true);
    expect(existsSync(join(outDir, "Counter.ts"))).toBe(true);
    expect(existsSync(join(outDir, "index.ts"))).toBe(true);
  });

  it("emits the abi as a const literal, which is what types args and read/write", () => {
    const mod = readFileSync(join(run(), "types", "Counter.ts"), "utf8");
    expect(mod).toContain('import type { GeneratedArtifact } from "deployoor"');
    expect(mod).toContain("as const");
    expect(mod).toContain("satisfies GeneratedArtifact<typeof abi>");
    expect(mod).toContain('"increment"'); // the real abi was serialized in
  });

  it("carries the fully-qualified name, which is how the artifact is found again", () => {
    const mod = readFileSync(join(run(), "types", "Counter.ts"), "utf8");
    expect(mod).toContain('fullyQualifiedName: "src/Counter.sol:Counter"');
  });

  it("leaves bytecode and the standard-json input out, so the file is committable", () => {
    // These are read from the compiled artifact at deploy time. `standardJsonInput` is the whole
    // compilation unit's source text, and inlining it per contract is what made `deployers/` large.
    const mod = readFileSync(join(run(), "types", "Counter.ts"), "utf8");
    expect(mod).not.toContain("bytecode");
    expect(mod).not.toContain("deployedBytecode");
    expect(mod).not.toContain("standardJsonInput");
    expect(mod).not.toContain("compilerVersion");
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

  it("emits config-bound register and reset in the index", () => {
    const idx = readFileSync(join(run(), "index.ts"), "utf8");
    expect(idx).toContain('import { defineRegister, defineReset } from "deployoor";');
    expect(idx).toContain('import config from "../deployoor.config";');
    expect(idx).toContain("export const register = defineRegister(config);");
    expect(idx).toContain("export const reset = defineReset(config);");
  });

  describe("without a config file", () => {
    it("inlines the defaults in the deployer instead of importing a config", () => {
      const mod = readFileSync(join(runWithoutConfig(), "Counter.ts"), "utf8");
      expect(mod).not.toContain("deployoor.config");
      expect(mod).toContain('import type { Config } from "deployoor";');
      expect(mod).toContain(
        "export const getOrDeployCounter = defineDeployer(counterArtifact, {} satisfies Config)",
      );
    });

    it("inlines the defaults in the index's register and reset", () => {
      const idx = readFileSync(join(runWithoutConfig(), "index.ts"), "utf8");
      expect(idx).not.toContain("deployoor.config");
      expect(idx).toContain("export const register = defineRegister({} satisfies Config);");
      expect(idx).toContain("export const reset = defineReset({} satisfies Config);");
    });
  });
});
