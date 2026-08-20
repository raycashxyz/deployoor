import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectImportExtension, resolveImportExtension } from "../../src/cli/import-extension";

/** A throwaway project root, optionally carrying a tsconfig.json with the given contents. */
const projectWith = (tsconfig?: string): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-tsconfig-"));
  if (tsconfig !== undefined) writeFileSync(join(root, "tsconfig.json"), tsconfig);
  return root;
};

const withCompilerOptions = (options: Record<string, string>): string =>
  JSON.stringify({ compilerOptions: options });

describe("detectImportExtension", () => {
  // The whole point of detecting: node16/nodenext reject an extensionless relative specifier with
  // TS2835, and nothing else does. Emitting extensions unconditionally breaks bundlers that do not
  // map `.js` back to `.ts`, so the two cases must not be collapsed.
  it("requires .js under moduleResolution node16", () => {
    expect(detectImportExtension(projectWith(withCompilerOptions({ moduleResolution: "node16" })))).toBe(
      "js",
    );
  });

  it("requires .js under moduleResolution nodenext", () => {
    expect(detectImportExtension(projectWith(withCompilerOptions({ moduleResolution: "nodenext" })))).toBe(
      "js",
    );
  });

  it("leaves them off under moduleResolution bundler", () => {
    expect(detectImportExtension(projectWith(withCompilerOptions({ moduleResolution: "bundler" })))).toBe(
      "none",
    );
  });

  // tsc compares these case-insensitively, and real tsconfigs are written both ways — the examples
  // in this repo alone have "Bundler" and "bundler".
  it("matches the resolution mode case-insensitively", () => {
    expect(detectImportExtension(projectWith(withCompilerOptions({ moduleResolution: "NodeNext" })))).toBe(
      "js",
    );
  });

  // moduleResolution is optional: tsc infers it from `module`, so "module": "nodenext" alone is
  // enough to put a project in strict-ESM resolution and hit TS2835.
  it("infers the mode from module when moduleResolution is unset", () => {
    expect(detectImportExtension(projectWith(withCompilerOptions({ module: "nodenext" })))).toBe("js");
  });

  it("does not infer strict ESM from module esnext, which resolves extensionless fine", () => {
    expect(detectImportExtension(projectWith(withCompilerOptions({ module: "esnext" })))).toBe("none");
  });

  it("prefers an explicit moduleResolution over what module would imply", () => {
    const root = projectWith(withCompilerOptions({ module: "nodenext", moduleResolution: "bundler" }));
    expect(detectImportExtension(root)).toBe("none");
  });

  // Falling back to "none" keeps a project deployoor cannot read on the form it has always emitted.
  it("falls back to no extensions when the project has no tsconfig", () => {
    expect(detectImportExtension(projectWith())).toBe("none");
  });

  it("falls back to no extensions when the tsconfig is unparseable", () => {
    expect(detectImportExtension(projectWith("{ this is not json"))).toBe("none");
  });

  // tsconfig.json is JSONC and tsc accepts both, so a hand-written one routinely has them.
  it("reads a tsconfig with comments and trailing commas", () => {
    const tsconfig = `{
      // the mode Hardhat 3 scaffolds
      "compilerOptions": {
        /* block comment */
        "moduleResolution": "node16",
      },
    }`;
    expect(detectImportExtension(projectWith(tsconfig))).toBe("js");
  });

  it("does not mistake a // inside a string value for a comment", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { moduleResolution: "node16", baseUrl: "https://example.com/x" },
    });
    expect(detectImportExtension(projectWith(tsconfig))).toBe("js");
  });

  describe("extends", () => {
    // The realistic miss: a project inherits nodenext from a preset (@tsconfig/node22 et al) and
    // states nothing itself, so reading only the top-level file reads it as extensionless.
    it("inherits the resolution mode from a relative base config", () => {
      const root = projectWith(JSON.stringify({ extends: "./base.json" }));
      writeFileSync(join(root, "base.json"), withCompilerOptions({ moduleResolution: "nodenext" }));
      expect(detectImportExtension(root)).toBe("js");
    });

    it("lets the extending file override what it inherits", () => {
      const root = projectWith(
        JSON.stringify({
          extends: "./base.json",
          compilerOptions: { moduleResolution: "bundler" },
        }),
      );
      writeFileSync(join(root, "base.json"), withCompilerOptions({ moduleResolution: "nodenext" }));
      expect(detectImportExtension(root)).toBe("none");
    });

    // TS 5.0+ allows an array, applied left to right with the last entry winning.
    it("applies an array of bases with the last one winning", () => {
      const root = projectWith(JSON.stringify({ extends: ["./a.json", "./b.json"] }));
      writeFileSync(join(root, "a.json"), withCompilerOptions({ moduleResolution: "bundler" }));
      writeFileSync(join(root, "b.json"), withCompilerOptions({ moduleResolution: "node16" }));
      expect(detectImportExtension(root)).toBe("js");
    });

    it("resolves a package base to its tsconfig.json", () => {
      const root = projectWith(JSON.stringify({ extends: "@tsconfig/fake" }));
      const pkg = join(root, "node_modules", "@tsconfig", "fake");
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@tsconfig/fake" }));
      writeFileSync(join(pkg, "tsconfig.json"), withCompilerOptions({ moduleResolution: "nodenext" }));
      expect(detectImportExtension(root)).toBe("js");
    });

    // tsc itself errors on a base it cannot read (TS5083), so such a project does not compile at
    // all and there is no intent worth guessing at. Falling back beats both failing `generate` and
    // half-reading a config tsc rejects.
    it("falls back to no extensions when a base cannot be resolved", () => {
      const root = projectWith(
        JSON.stringify({ extends: "@nope/missing", compilerOptions: { moduleResolution: "node16" } }),
      );
      expect(detectImportExtension(root)).toBe("none");
    });

    // A monorepo package often has no tsconfig of its own and is governed by the nearest one above
    // it — which is the config tsc and tsx would apply, so it is the one to read.
    it("finds the nearest tsconfig above a project that has none of its own", () => {
      const workspace = projectWith(withCompilerOptions({ moduleResolution: "nodenext" }));
      const pkg = join(workspace, "packages", "contracts");
      mkdirSync(pkg, { recursive: true });
      expect(detectImportExtension(pkg)).toBe("js");
    });

    // A cycle is invalid per tsc; deployoor only has to terminate on it.
    it("terminates on a cyclic extends chain", () => {
      const root = projectWith(JSON.stringify({ extends: "./loop.json" }));
      writeFileSync(join(root, "loop.json"), JSON.stringify({ extends: "./tsconfig.json" }));
      expect(detectImportExtension(root)).toBe("none");
    });
  });
});

describe("resolveImportExtension", () => {
  it("detects when the setting is absent or auto", () => {
    const root = projectWith(withCompilerOptions({ moduleResolution: "node16" }));
    expect(resolveImportExtension(undefined, root)).toBe("js");
    expect(resolveImportExtension("auto", root)).toBe("js");
  });

  // The escape hatch both ways: a node16 project whose bundler chokes on `.js`, and a bundler
  // project that wants them anyway.
  it("lets an explicit setting override detection", () => {
    const node16 = projectWith(withCompilerOptions({ moduleResolution: "node16" }));
    expect(resolveImportExtension("none", node16)).toBe("none");

    const bundler = projectWith(withCompilerOptions({ moduleResolution: "bundler" }));
    expect(resolveImportExtension("js", bundler)).toBe("js");
  });
});
