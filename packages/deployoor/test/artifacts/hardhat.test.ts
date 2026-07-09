import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHardhatArtifacts } from "../../src/artifacts/hardhat";
import { detectFramework } from "../../src/artifacts/detect";

const projectRoot = join(import.meta.dirname, "..", "fixtures", "hh");
const artifactsDir = join(projectRoot, "artifacts");
const hh3ArtifactsDir = join(import.meta.dirname, "..", "fixtures", "hh3", "artifacts");

describe("readHardhatArtifacts", () => {
  it("parses deployable contracts, skipping interfaces (empty bytecode)", () => {
    const artifacts = readHardhatArtifacts(artifactsDir);
    expect(artifacts.map((a) => a.name)).toEqual(["Counter"]); // ICounter skipped
  });

  it("enriches metadata from the .dbg → build-info chain", () => {
    const [counter] = readHardhatArtifacts(artifactsDir);
    expect(counter?.metadata.fullyQualifiedName).toBe("contracts/Counter.sol:Counter");
    expect(counter?.metadata.compilerVersion).toBe("0.8.35+commit.40a35a09");
    expect(counter?.metadata.standardJsonInput.sources["contracts/Counter.sol"]?.content).toContain(
      "Counter",
    );
    expect(counter?.bytecode).toMatch(/^0x60/);
  });

  it("throws ArtifactsNotFound when the artifacts dir is missing", () => {
    expect(() => readHardhatArtifacts(join(artifactsDir, "nope"))).toThrowError(/No compiled artifacts/);
  });

  it("keeps a contract whose bytecode has unlinked library placeholders (so it gets a deployer)", () => {
    // Regression: the strict Hex validator used to reject `__$…$__` placeholders, so a
    // library-linked contract was silently dropped even though the deploy path links it.
    const dir = mkdtempSync(join(tmpdir(), "deployoor-hh-lib-"));
    const contractDir = join(dir, "contracts", "UsesLib.sol");
    mkdirSync(contractDir, { recursive: true });
    writeFileSync(
      join(contractDir, "UsesLib.json"),
      JSON.stringify({
        contractName: "UsesLib",
        sourceName: "contracts/UsesLib.sol",
        abi: [],
        bytecode: "0x6080__$f2b8c1a0d3e4f5061728394a5b6c7d8e9f$__",
        linkReferences: { "contracts/MathLib.sol": { MathLib: [{ start: 4, length: 20 }] } },
      }),
    );

    const [artifact] = readHardhatArtifacts(dir);
    expect(artifact?.name).toBe("UsesLib");
    expect(artifact?.bytecode).toContain("__$"); // placeholder retained for deploy-time linking
    expect(Object.keys(artifact?.metadata.libraryPlaceholders ?? {})).toContain("MathLib");
  });
});

describe("detectFramework", () => {
  it("detects hardhat from an artifacts dir", () => {
    expect(detectFramework(projectRoot)).toBe("hardhat");
  });
});

describe("readHardhatArtifacts — Hardhat 3 layout", () => {
  it("resolves build-info via the artifact's buildInfoId (no .dbg.json)", () => {
    const [counter] = readHardhatArtifacts(hh3ArtifactsDir);
    expect(counter?.name).toBe("Counter"); // ICounter (empty bytecode) skipped
    expect(counter?.bytecode).toMatch(/^0x60/);
    // HH3 build-info still carries solcLongVersion + the standard-json input.
    expect(counter?.metadata.compilerVersion).toBe("0.8.35+commit.40a35a09");
    expect(counter?.metadata.standardJsonInput.settings).toMatchObject({
      optimizer: { enabled: true, runs: 200 },
    });
  });

  it("uses inputSourceName for the fully-qualified name so it matches the std-json source key", () => {
    const [counter] = readHardhatArtifacts(hh3ArtifactsDir);
    // sourceName is contracts/Counter.sol, but solc compiled it as project/contracts/Counter.sol;
    // the FQN (and the std-json sources key) must use the latter for verification to match.
    expect(counter?.metadata.fullyQualifiedName).toBe("project/contracts/Counter.sol:Counter");
    expect(counter?.metadata.standardJsonInput.sources["project/contracts/Counter.sol"]?.content).toContain(
      "contract Counter",
    );
  });
});
