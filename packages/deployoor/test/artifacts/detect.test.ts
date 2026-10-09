import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectFramework, detectToolchain } from "../../src/artifacts/detect";

/** A fresh project root holding `files` (path relative to the root → contents). */
const project = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-detect-"));
  Object.entries(files).forEach(([path, contents]) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), contents);
  });
  return root;
};

describe("detectToolchain", () => {
  it("detects Foundry from foundry.toml", () => {
    expect(detectToolchain(project({ "foundry.toml": "[profile.default]\n" }))).toEqual({
      framework: "foundry",
      marker: "foundry.toml",
    });
  });

  it("detects Hardhat from a hardhat.config.*", () => {
    expect(detectToolchain(project({ "hardhat.config.ts": "export default {};" }))).toEqual({
      framework: "hardhat",
      marker: "hardhat.config.ts",
    });
  });

  it("prefers Foundry when a project carries both markers", () => {
    const root = project({ "foundry.toml": "", "hardhat.config.js": "module.exports = {};" });

    expect(detectFramework(root)).toBe("foundry");
  });

  it("does not detect a plain-Solidity project with sources under src/ and no markers", () => {
    // This used to be the zero-config tevm fallback, which compiled the sources itself. deployoor now
    // only reads compiled artifacts, so `.sol` files alone are not a toolchain.
    const root = project({ "src/Counter.sol": "contract Counter {}" });

    expect(detectToolchain(root)).toBeNull();
  });

  it("does not detect nested sources under contracts/ either", () => {
    const root = project({ "contracts/token/Token.sol": "contract Token {}" });

    expect(detectToolchain(root)).toBeNull();
  });

  it("does not treat a tevm.config.* as a toolchain marker", () => {
    const root = project({ "tevm.config.json": "{}", "src/Counter.sol": "contract Counter {}" });

    expect(detectToolchain(root)).toBeNull();
  });

  it("still detects the framework when .sol sources sit beside its marker", () => {
    const root = project({ "hardhat.config.js": "module.exports = {};", "contracts/A.sol": "contract A {}" });

    expect(detectFramework(root)).toBe("hardhat");
  });

  it("does not walk the source tree, so a symlink cycle under src/ is harmless", () => {
    // The removed `.sol` scan recursed into src/, and a link back to an ancestor once blew the stack.
    const root = project({ "src/nested/.keep": "" });
    symlinkSync(join(root, "src"), join(root, "src", "nested", "loop"), "dir");

    expect(detectFramework(root)).toBeNull();
  });
});
