import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectFramework } from "../../src/artifacts/detect";

describe("detectFramework, symlinks", () => {
  it("terminates on a symlink cycle instead of blowing the stack", () => {
    // `stat` follows symlinks, so a link pointing back at an ancestor recursed until the stack blew.
    // There must be no `.sol` to find: the scan short-circuits on the first hit, so a cycle is only
    // reached when the walk has to exhaust the tree.
    const root = mkdtempSync(join(tmpdir(), "deployoor-symlink-"));
    const src = join(root, "src");
    mkdirSync(join(src, "nested"), { recursive: true });
    symlinkSync(src, join(src, "nested", "loop"), "dir");

    expect(detectFramework(root)).toBeNull();
  });

  it("terminates on a cycle even when a source file exists past it", () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-symlink-mixed-"));
    const src = join(root, "src");
    mkdirSync(join(src, "a-nested"), { recursive: true });
    symlinkSync(src, join(src, "a-nested", "loop"), "dir");
    // sorts after `a-nested`, so the cycle is walked first
    writeFileSync(join(src, "zzz.sol"), "contract Z {}");

    expect(detectFramework(root)).toBe("tevm");
  });

  it("still finds sources in a plain nested directory", () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-nested-"));
    mkdirSync(join(root, "contracts", "token"), { recursive: true });
    writeFileSync(join(root, "contracts", "token", "Token.sol"), "contract Token {}");

    expect(detectFramework(root)).toBe("tevm");
  });
});
