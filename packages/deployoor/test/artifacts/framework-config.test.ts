import { describe, it, expect, afterEach } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFoundryOutPath, readHardhatArtifactsPath } from "../../src/artifacts/framework-config";
import { readArtifactsAsync } from "../../src/artifacts";

const fixtureArtifacts = join(import.meta.dirname, "..", "fixtures", "hh", "artifacts");
const fixtureOut = join(import.meta.dirname, "..", "fixtures", "fdry", "out");

const project = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-fwcfg-"));
  Object.entries(files).forEach(([name, contents]) => writeFileSync(join(root, name), contents));
  return root;
};

/** Copy a fixture's compiled output to an arbitrary directory inside `root`. */
const putArtifactsAt = (root: string, relative: string, from: string): void => {
  mkdirSync(join(root, relative, ".."), { recursive: true });
  cpSync(from, join(root, relative), { recursive: true });
};

describe("readHardhatArtifactsPath", () => {
  it("reads paths.artifacts out of a CommonJS hardhat.config.js", async () => {
    const root = project({
      "hardhat.config.js": "module.exports = { paths: { artifacts: './build/arts' } };",
    });
    await expect(readHardhatArtifactsPath(root)).resolves.toBe("./build/arts");
  });

  it("reads paths.artifacts out of an ESM/TS hardhat.config.ts", async () => {
    const root = project({
      "hardhat.config.ts": "export default { paths: { artifacts: './out/hh' }, solidity: '0.8.24' };",
    });
    await expect(readHardhatArtifactsPath(root)).resolves.toBe("./out/hh");
  });

  it("returns undefined when the config sets no artifacts path", async () => {
    const root = project({ "hardhat.config.js": "module.exports = { solidity: '0.8.24' };" });
    await expect(readHardhatArtifactsPath(root)).resolves.toBeUndefined();
  });

  it("returns undefined rather than throwing when the config fails to load", async () => {
    // hardhat.config is arbitrary user code — an unresolvable import must not break `generate`.
    const root = project({ "hardhat.config.js": "require('a-plugin-that-is-not-installed');" });
    await expect(readHardhatArtifactsPath(root)).resolves.toBeUndefined();
  });

  it("returns undefined when there is no hardhat config at all", async () => {
    await expect(readHardhatArtifactsPath(project({}))).resolves.toBeUndefined();
  });
});

describe("readFoundryOutPath", () => {
  it("reads out from the default profile", () => {
    const root = project({ "foundry.toml": '[profile.default]\nsrc = "src"\nout = "artifacts"\n' });
    expect(readFoundryOutPath(root)).toBe("artifacts");
  });

  it("ignores out set under a different profile", () => {
    const root = project({ "foundry.toml": '[profile.ci]\nout = "ci-out"\n' });
    expect(readFoundryOutPath(root)).toBeUndefined();
  });

  it("honours FOUNDRY_PROFILE", () => {
    const root = project({ "foundry.toml": '[profile.default]\nout = "d"\n[profile.ci]\nout = "ci-out"\n' });
    process.env.FOUNDRY_PROFILE = "ci";
    expect(readFoundryOutPath(root)).toBe("ci-out");
  });

  it("skips comments and accepts single quotes", () => {
    const root = project({ "foundry.toml": "[profile.default]\n# out = \"commented\"\nout = 'single'\n" });
    expect(readFoundryOutPath(root)).toBe("single");
  });

  it("returns undefined when out is absent", () => {
    expect(
      readFoundryOutPath(project({ "foundry.toml": '[profile.default]\nsrc = "src"\n' })),
    ).toBeUndefined();
  });

  afterEach(() => {
    delete process.env.FOUNDRY_PROFILE;
  });
});

describe("readArtifactsAsync honours the framework's own config", () => {
  it("finds Hardhat artifacts under a custom paths.artifacts, with no deployoor config", async () => {
    const root = project({
      "hardhat.config.js": "module.exports = { paths: { artifacts: './build/arts' } };",
    });
    putArtifactsAt(root, join("build", "arts"), fixtureArtifacts);

    const artifacts = await readArtifactsAsync(root);
    expect(artifacts.map((a) => a.name)).toEqual(["Counter"]);
  });

  it("finds Foundry artifacts under a custom out, with no deployoor config", async () => {
    const root = project({ "foundry.toml": '[profile.default]\nout = "build/forge"\n' });
    putArtifactsAt(root, join("build", "forge"), fixtureOut);

    const artifacts = await readArtifactsAsync(root);
    expect(artifacts.map((a) => a.name)).toEqual(["Counter"]);
  });

  it("lets an explicit artifactsPath win over the framework's config", async () => {
    const root = project({
      "hardhat.config.js": "module.exports = { paths: { artifacts: './build/wrong' } };",
    });
    putArtifactsAt(root, join("build", "right"), fixtureArtifacts);

    const artifacts = await readArtifactsAsync(root, { artifactsPath: "./build/right" });
    expect(artifacts.map((a) => a.name)).toEqual(["Counter"]);
  });

  it("says the dir came from the project's own config, so there is nothing left to configure", async () => {
    const root = project({
      "hardhat.config.js": "module.exports = { paths: { artifacts: './build/arts' } };",
    });
    const error = await readArtifactsAsync(root).catch((e: unknown) => e);
    const message = error instanceof Error ? error.message : String(error);

    expect(message).toContain("build/arts");
    expect(message).toContain("its own config");
    expect(message).toContain("npx hardhat compile");
    // Suggesting artifactsPath here would be wrong — the path is already correct.
    expect(message).not.toContain("export default defineConfig");
  });
});
