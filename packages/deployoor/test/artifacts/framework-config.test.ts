import { describe, it, expect, afterEach, vi } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFoundryOutPath, readHardhatArtifactsPath } from "../../src/artifacts/framework-config";
import { readArtifactsAsync } from "../../src/artifacts";
import { ArtifactsNotFound } from "../../src/errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("reads paths.artifacts from a config that cannot be evaluated", async () => {
    // The case the custom-paths example surfaced. A config that registers a plugin throws when it is
    // imported outside a Hardhat run — the real message is `HH5: HardhatContext is not created` — and
    // that is the normal shape of a Hardhat project, not an edge case. Treating the failure as "no
    // paths.artifacts" sent every such project to the default directory, and it broke at *deploy*
    // time while `generate` worked, because the Hardhat plugin passes the path in directly.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { solidity: '0.8.24', paths: { sources: 'src/contracts', artifacts: 'build/artifacts' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("build/artifacts");
  });

  it("ignores a commented-out paths block above the real one", async () => {
    // Text is read in order, so the commented block used to win purely on position — and it wins
    // silently, pointing deployoor at a directory the project stopped compiling into.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        '// paths: { artifacts: "old/place" },',
        "module.exports = { paths: { artifacts: 'build/artifacts' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("build/artifacts");
  });

  it("ignores a block-commented paths block too", async () => {
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        '/* paths: { artifacts: "commented" } */',
        "module.exports = { paths: { artifacts: 'real' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("real");
  });

  it("skips a paths block nested in networks and takes the exported one", async () => {
    // `networks.local.paths` comes first in the file, so it used to win on position alone. `paths` is
    // now required to be a direct key of the exported object, which the nested one is not.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = {",
        "  networks: { local: { paths: { artifacts: 'decoy' } } },",
        "  paths: { artifacts: 'build/artifacts' },",
        "};",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("build/artifacts");
  });

  it("skips an artifacts key nested inside paths and takes the direct one", async () => {
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { paths: { extra: { artifacts: 'decoy' }, artifacts: 'build/artifacts' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("build/artifacts");
  });

  it("returns undefined when the only paths block belongs to something else", async () => {
    // Nothing to read: there is no exported `paths`, so an unrelated nested one must not stand in for
    // it. Reading it would point deployoor at a directory the project never compiles into.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { networks: { local: { paths: { artifacts: 'unrelated' } } } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBeUndefined();
  });

  it("is not fooled by a brace inside a string", async () => {
    // Depth counting runs over a copy with string contents blanked; without that, this `{` shifts
    // every depth after it and `paths` stops looking like a direct key.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { note: 'a { brace', paths: { artifacts: 'build/artifacts' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("build/artifacts");
  });

  it("returns undefined when the config exports nothing it can find", async () => {
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "const config = { paths: { artifacts: 'never-exported' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBeUndefined();
  });

  it("does not treat a URL inside a string as a comment", async () => {
    // Stripping comments must not treat the `//` in `https://…` as one. The paths block sits after the
    // URL on the same line, so a naive strip takes it with the rest of the line and the answer is lost.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { rpc: 'https://sepolia.example.dev', paths: { artifacts: 'build/artifacts' } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("build/artifacts");
  });

  it("does not mistake an artifacts key outside paths for this one", async () => {
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { paths: { sources: 'src' }, artifacts: 'DECOY' };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBeUndefined();
  });

  it("declines a computed artifacts path rather than guessing at it", async () => {
    // Text cannot resolve `join(__dirname, …)`, and inventing an answer would be worse than the
    // reported default — `artifactsPath` is the escape hatch for this.
    const root = project({
      "hardhat.config.js": [
        "require('a-plugin-that-is-not-installed');",
        "module.exports = { paths: { artifacts: require('path').join(__dirname, 'x') } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBeUndefined();
  });

  it("prefers the evaluated config over the text scan when both could answer", async () => {
    // An importable config is authoritative: it can compute a path the text cannot see.
    const root = project({
      "hardhat.config.js": [
        "const dir = 'from-code';",
        "module.exports = { paths: { artifacts: dir } };",
      ].join("\n"),
    });

    await expect(readHardhatArtifactsPath(root)).resolves.toBe("from-code");
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
    // stubEnv rather than assigning process.env: the reader consults it at call time, so a value
    // leaking out of this test would silently change what every later test resolves.
    vi.stubEnv("FOUNDRY_PROFILE", "ci");
    expect(readFoundryOutPath(root)).toBe("ci-out");
  });

  it("skips comments and accepts single quotes", () => {
    const root = project({ "foundry.toml": "[profile.default]\n# out = \"commented\"\nout = 'single'\n" });
    expect(readFoundryOutPath(root)).toBe("single");
  });

  it("inherits out from profile.default when the active profile does not set it", () => {
    // Every Foundry profile inherits from [profile.default], so keying only on the active table
    // read `out` as absent and fell back to ./out — the wrong directory.
    const root = project({
      "foundry.toml": '[profile.default]\nout = "artifacts"\n\n[profile.ci]\nverbosity = 3\n',
    });
    vi.stubEnv("FOUNDRY_PROFILE", "ci");
    expect(readFoundryOutPath(root)).toBe("artifacts");
  });

  it("prefers the active profile's own out over the inherited one", () => {
    const root = project({
      "foundry.toml": '[profile.default]\nout = "d-out"\n[profile.ci]\nout = "ci-out"\n',
    });
    vi.stubEnv("FOUNDRY_PROFILE", "ci");
    expect(readFoundryOutPath(root)).toBe("ci-out");
  });

  it("lets FOUNDRY_OUT win over the file, the way forge does", () => {
    const root = project({ "foundry.toml": '[profile.default]\nout = "artifacts"\n' });
    vi.stubEnv("FOUNDRY_OUT", "env-out");
    expect(readFoundryOutPath(root)).toBe("env-out");
  });

  it("ignores an empty FOUNDRY_OUT", () => {
    const root = project({ "foundry.toml": '[profile.default]\nout = "artifacts"\n' });
    vi.stubEnv("FOUNDRY_OUT", "");
    expect(readFoundryOutPath(root)).toBe("artifacts");
  });

  it("returns undefined when out is absent", () => {
    expect(
      readFoundryOutPath(project({ "foundry.toml": '[profile.default]\nsrc = "src"\n' })),
    ).toBeUndefined();
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
    // Pin the error itself before its prose: a different failure with a coincidentally matching
    // message would otherwise pass, and the repo's convention is to assert specific errors.
    expect(error).toBeInstanceOf(ArtifactsNotFound);
    const message = error instanceof Error ? error.message : String(error);

    // join(), not a literal "build/arts": the message carries a resolved path, so the separator is
    // backslash on Windows.
    expect(message).toContain(join("build", "arts"));
    expect(message).toContain("its own config");
    expect(message).toContain("npx hardhat compile");
    // Suggesting artifactsPath here would be wrong — the path is already correct.
    expect(message).not.toContain("export default defineConfig");
  });
});
