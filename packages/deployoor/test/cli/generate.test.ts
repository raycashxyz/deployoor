import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGenerate } from "../../src/cli/generate";
import { runInit, isDeployoorInstalled } from "../../src/cli/init";

const hhRoot = join(import.meta.dirname, "..", "fixtures", "hh");

describe("runGenerate", () => {
  it("reads a project's artifacts and emits a deployer per deployable contract", async () => {
    const project = mkdtempSync(join(tmpdir(), "deployoor-gen-"));
    const out = join(project, "deployers");
    const files = await runGenerate({ root: hhRoot, out, configPath: join(project, "deployoor.config.ts") });

    expect(existsSync(join(out, "Counter.ts"))).toBe(true); // deployer
    expect(existsSync(join(out, "types", "Counter.ts"))).toBe(true); // artifact module
    expect(existsSync(join(out, "ICounter.ts"))).toBe(false); // interface skipped
    expect(files.length).toBeGreaterThan(0);

    const deployer = readFileSync(join(out, "Counter.ts"), "utf8");
    expect(deployer).toContain("export const getOrDeployCounter = defineDeployer(counterArtifact, config)");
    expect(deployer).toContain('import config from "../deployoor.config"'); // deployers/ → ../deployoor.config
  });

  it("fails when an include filter matches no deployable contracts", async () => {
    const project = mkdtempSync(join(tmpdir(), "deployoor-gen-"));
    const out = join(project, "deployers");
    await expect(
      runGenerate({ root: hhRoot, out, configPath: join(project, "deployoor.config.ts"), include: ["Nope"] }),
    ).rejects.toThrow(/matched none/);
    expect(existsSync(join(out, "Counter.ts"))).toBe(false);
  });

  it("warns about an include name that matched no contract while still generating the rest", async () => {
    const project = mkdtempSync(join(tmpdir(), "deployoor-gen-"));
    const out = join(project, "deployers");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runGenerate({
      root: hhRoot,
      out,
      configPath: join(project, "deployoor.config.ts"),
      include: ["Counter", "Ghost"],
    });
    expect(existsSync(join(out, "Counter.ts"))).toBe(true); // the matched contract still generates
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Ghost")); // the missing one is surfaced
    warn.mockRestore();
  });
});

describe("runInit + isDeployoorInstalled", () => {
  it("scaffolds deployoor.config.ts when absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-init-"));
    const first = await runInit(root);
    expect(first.created).toBe(true);
    expect(readFileSync(first.configPath, "utf8")).toContain("defineConfig");
    expect((await runInit(root)).created).toBe(false); // idempotent
  });

  it("names the detected toolchain and where its artifacts are", async () => {
    // The scaffold's job beyond the defaults: confirm what deployoor resolved, so a project whose
    // build output moved can see that deployoor already found it.
    const root = mkdtempSync(join(tmpdir(), "deployoor-init-foundry-"));
    writeFileSync(join(root, "foundry.toml"), '[profile.default]\nout = "artifacts"\n');

    const { configPath } = await runInit(root);
    const contents = readFileSync(configPath, "utf8");

    expect(contents).toContain("Detected: foundry, artifacts in artifacts (from foundry.toml)");
    // Commented out on purpose: foundry.toml already owns this value, and copying it here creates a
    // second source of truth free to drift from the first.
    expect(contents).toContain('// artifactsPath: "artifacts",');
  });

  it("has exactly one of two concurrent runs create the file", async () => {
    // Detection is async (reading hardhat.config goes through jiti), so an existsSync guard before it
    // leaves a real window: both calls see no file, both write, and the second truncates the first —
    // while both report `created: true`. Exclusive creation makes the check and the claim one step.
    const root = mkdtempSync(join(tmpdir(), "deployoor-init-race-"));
    writeFileSync(join(root, "foundry.toml"), '[profile.default]\nout = "artifacts"\n');

    const results = await Promise.all([runInit(root), runInit(root)]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(readFileSync(join(root, "deployoor.config.ts"), "utf8")).toContain("defineConfig");
  });

  it("rethrows a write failure that is not the file already existing", async () => {
    // `wx` turns "already there" into EEXIST, which is a normal `created: false`. Anything else is a
    // real failure and must not be swallowed as one — a root that does not exist fails with ENOENT,
    // and does so on every platform, unlike a permissions trick.
    const root = join(mkdtempSync(join(tmpdir(), "deployoor-init-enoent-")), "no", "such", "dir");

    await expect(runInit(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("says so when there is no toolchain to detect", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-init-bare-"));

    const contents = readFileSync((await runInit(root)).configPath, "utf8");

    expect(contents).toContain("No Foundry, Hardhat or Solidity sources detected");
  });

  it("detects whether deployoor is a declared dependency", () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-dep-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: { deployoor: "^0.0.0" } }));
    expect(isDeployoorInstalled(root)).toBe(true);

    const bare = mkdtempSync(join(tmpdir(), "deployoor-dep-"));
    writeFileSync(join(bare, "package.json"), JSON.stringify({ devDependencies: {} }));
    expect(isDeployoorInstalled(bare)).toBe(false);
  });
});
