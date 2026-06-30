import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readHardhatArtifacts } from "../../src/artifacts/hardhat";
import { detectFramework } from "../../src/artifacts/detect";

const projectRoot = join(import.meta.dirname, "..", "fixtures", "hh");
const artifactsDir = join(projectRoot, "artifacts");

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
});

describe("detectFramework", () => {
  it("detects hardhat from an artifacts dir", () => {
    expect(detectFramework(projectRoot)).toBe("hardhat");
  });
});
