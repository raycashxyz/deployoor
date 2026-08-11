import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeployoorInstalled, missingDependencies } from "../../src/cli/init";

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

  it("agrees with isDeployoorInstalled about a workspace-hoisted install", () => {
    // These used to disagree: the CLI gate accepted a hoisted dependency while `generateDeployers`
    // threw on the same project, which is the programmatic half of the original report.
    const workspace = mkdtempSync(join(tmpdir(), "deployoor-ws-agree-"));
    installed(workspace, "viem");
    installed(workspace, "deployoor");
    const pkg = join(workspace, "packages", "app");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "app" }));

    expect(missingDependencies(pkg)).toEqual([]);
    expect(isDeployoorInstalled(pkg)).toBe(true);
  });

  it("reports both when neither resolves nor is declared", () => {
    const bare = mkdtempSync(join(tmpdir(), "deployoor-bare-"));
    writeFileSync(join(bare, "package.json"), JSON.stringify({ name: "bare" }));

    expect(missingDependencies(bare)).toEqual(["deployoor", "viem"]);
  });

  it("counts a peerDependencies declaration", () => {
    // A peer declaration is a deliberate statement of intent; asking the user to add a dependency
    // they already declared is noise.
    const peer = mkdtempSync(join(tmpdir(), "deployoor-peer-"));
    writeFileSync(
      join(peer, "package.json"),
      JSON.stringify({ name: "p", peerDependencies: { deployoor: ">=0.5.0", viem: "^2" } }),
    );

    expect(missingDependencies(peer)).toEqual([]);
  });

  it("counts an optionalDependencies declaration", () => {
    const optional = mkdtempSync(join(tmpdir(), "deployoor-optional-"));
    writeFileSync(
      join(optional, "package.json"),
      JSON.stringify({ name: "o", optionalDependencies: { deployoor: "^0.6.0", viem: "^2" } }),
    );

    expect(missingDependencies(optional)).toEqual([]);
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
