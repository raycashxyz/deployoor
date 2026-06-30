import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFoundryArtifacts } from "../../src/artifacts/foundry";
import { detectFramework, readArtifacts } from "../../src/artifacts";

const fdryRoot = join(import.meta.dirname, "..", "fixtures", "fdry");
const hhRoot = join(import.meta.dirname, "..", "fixtures", "hh");

describe("readFoundryArtifacts", () => {
  it("parses out/ artifacts, reading bytecode from the nested `.object`", () => {
    const [counter] = readFoundryArtifacts(join(fdryRoot, "out"));
    expect(counter?.name).toBe("Counter");
    expect(counter?.bytecode).toMatch(/^0x60/);
    expect(counter?.metadata.fullyQualifiedName).toBe("src/Counter.sol:Counter");
    expect(counter?.metadata.compilerVersion).toBe("0.8.35+commit.40a35a09");
    expect(counter?.metadata.standardJsonInput.sources["src/Counter.sol"]?.content).toContain("Counter");
  });

  it("throws ArtifactsNotFound when out/ is missing", () => {
    expect(() => readFoundryArtifacts(join(fdryRoot, "nope"))).toThrowError(/No compiled artifacts/);
  });
});

describe("readArtifacts (detect + dispatch)", () => {
  it("detects and reads a Foundry project", () => {
    expect(detectFramework(fdryRoot)).toBe("foundry");
    expect(readArtifacts(fdryRoot).map((a) => a.name)).toEqual(["Counter"]);
  });

  it("detects and reads a Hardhat project", () => {
    expect(detectFramework(hhRoot)).toBe("hardhat");
    expect(readArtifacts(hhRoot).map((a) => a.name)).toEqual(["Counter"]);
  });
});
