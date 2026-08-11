import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGenerate } from "../../src/cli/generate";

const pkgRoot = join(import.meta.dirname, "..", "..");
const hhRoot = join(pkgRoot, "test", "fixtures", "hh");
const distTypes = join(pkgRoot, "dist", "index.d.mts");
const requireFromTest = createRequire(import.meta.url);
const tscBin = requireFromTest.resolve("typescript/bin/tsc");
const tsdownBin = requireFromTest.resolve("tsdown/run");

const ensureBuilt = (): void => {
  if (existsSync(distTypes)) return;
  execFileSync(process.execPath, [tsdownBin], { cwd: pkgRoot, stdio: "ignore" });
};

// The codegen spine: prove the emitted deployers + artifact modules + the config
// import actually compile against deployoor's published types (catches template bugs a
// content assertion can't — wrong imports, a broken `satisfies`, signature drift).
describe("generated deployers type-check against deployoor", () => {
  beforeAll(() => {
    // dist/index.d.mts is what the emitted code resolves `deployoor` to.
    ensureBuilt();
  }, 120_000);

  const runTsc = (project: string): string => {
    try {
      execFileSync(process.execPath, [tscBin, "-p", join(project, "tsconfig.json")], { stdio: "pipe" });
      return "";
    } catch (error) {
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      return `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
  };

  /** Generate into a throwaway project — with or without a config file — and tsc the result. */
  const typecheckEmitted = async ({ withConfig }: { withConfig: boolean }): Promise<string> => {
    const project = mkdtempSync(join(tmpdir(), "deployoor-tsc-"));
    const configPath = join(project, "deployoor.config.ts");
    await runGenerate({
      root: hhRoot,
      out: join(project, "deployers"),
      ...(withConfig ? { configPath } : {}),
    });
    if (withConfig) {
      writeFileSync(
        configPath,
        'import { defineConfig } from "deployoor";\nexport default defineConfig({});\n',
      );
    }
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
        include: withConfig ? ["deployers/**/*.ts", "deployoor.config.ts"] : ["deployers/**/*.ts"],
      }),
    );

    return runTsc(project);
  };

  it("compiles the emitted deployers, artifact modules, and config", async () => {
    const diagnostics = await typecheckEmitted({ withConfig: true });
    expect(diagnostics, diagnostics).toBe("");
  }, 60_000);

  // The zero-config path: no deployoor.config.* anywhere, so the deployers carry `{} satisfies
  // Config` inline. Proves the inlined defaults satisfy the same signature the imported config does.
  it("compiles the emitted deployers when the project has no config file", async () => {
    const diagnostics = await typecheckEmitted({ withConfig: false });
    expect(diagnostics, diagnostics).toBe("");
  }, 60_000);
});
