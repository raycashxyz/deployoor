import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGenerate } from "../../src/cli/generate";

const pkgRoot = join(import.meta.dirname, "..", "..");
const hhRoot = join(pkgRoot, "test", "fixtures", "hh");
const distTypes = join(pkgRoot, "dist", "index.d.mts");
const tscBin = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// The codegen spine: prove the emitted deployers + artifact modules + the config
// import actually compile against deployoor's published types (catches template bugs a
// content assertion can't — wrong imports, a broken `satisfies`, signature drift).
describe("generated deployers type-check against deployoor", () => {
  beforeAll(() => {
    // dist/index.d.mts is what the emitted code resolves `deployoor` to.
    execFileSync("pnpm", ["build"], { cwd: pkgRoot, stdio: "ignore" });
  }, 120_000);

  it("compiles the emitted deployers, artifact modules, and config", () => {
    const project = mkdtempSync(join(tmpdir(), "deployoor-tsc-"));
    runGenerate({
      root: hhRoot,
      out: join(project, "deployers"),
      configPath: join(project, "deployoor.config.ts"),
    });
    writeFileSync(
      join(project, "deployoor.config.ts"),
      'import { defineConfig } from "deployoor";\nexport default defineConfig({});\n',
    );
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: "esnext",
          moduleResolution: "bundler",
          target: "es2022",
          noEmit: true,
          skipLibCheck: true,
          baseUrl: ".",
          paths: { deployoor: [distTypes] },
        },
        include: ["deployers/**/*.ts", "deployoor.config.ts"],
      }),
    );

    let diagnostics = "";
    try {
      execFileSync(process.execPath, [tscBin, "-p", join(project, "tsconfig.json")], { stdio: "pipe" });
    } catch (error) {
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      diagnostics = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(diagnostics, diagnostics).toBe("");
  }, 60_000);
});
