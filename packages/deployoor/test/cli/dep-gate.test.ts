import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { missingDependencies } from "../../src/cli/init";

/** A minimal resolvable package inside `root/node_modules`. */
const installed = (root: string, name: string): void => {
  const dir = join(root, "node_modules", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", main: "index.js" }));
  writeFileSync(join(dir, "index.js"), "");
};

describe("missingDependencies", () => {
  it("does not report a dependency that resolves from a workspace ancestor", () => {
    // The case that made the old declaration-only check wrong: a package in a monorepo whose deps
    // are hoisted to the workspace root declares neither, yet the emitted import resolves.
    const workspace = mkdtempSync(join(tmpdir(), "deployoor-ws-"));
    installed(workspace, "viem");
    installed(workspace, "deployoor");
    const pkg = join(workspace, "packages", "app");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "app" }));

    expect(missingDependencies(pkg)).toEqual([]);
  });

  it("reports both when neither resolves nor is declared", () => {
    const bare = mkdtempSync(join(tmpdir(), "deployoor-bare-"));
    writeFileSync(join(bare, "package.json"), JSON.stringify({ name: "bare" }));

    expect(missingDependencies(bare)).toEqual(["deployoor", "viem"]);
  });

  it("reports nothing when they are declared but not installed yet", () => {
    const declared = mkdtempSync(join(tmpdir(), "deployoor-declared-"));
    writeFileSync(
      join(declared, "package.json"),
      JSON.stringify({ name: "d", devDependencies: { deployoor: "^0.6.0", viem: "^2" } }),
    );

    expect(missingDependencies(declared)).toEqual([]);
  });
});
