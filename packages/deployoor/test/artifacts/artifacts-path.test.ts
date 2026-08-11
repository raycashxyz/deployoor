import { describe, it, expect } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readArtifactsAsync } from "../../src/artifacts";
import { ArtifactsNotFound } from "../../src/errors";

const fixtureArtifacts = join(import.meta.dirname, "..", "fixtures", "hh", "artifacts");

/** A Hardhat project whose compiler output sits outside the default `artifacts/`. */
const projectWithMovedArtifacts = (): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-artifacts-path-"));
  writeFileSync(
    join(root, "hardhat.config.js"),
    "module.exports = { paths: { artifacts: './build/arts' } };",
  );
  mkdirSync(join(root, "build"), { recursive: true });
  cpSync(fixtureArtifacts, join(root, "build", "arts"), { recursive: true });
  return root;
};

describe("artifactsPath", () => {
  it("reads artifacts from a directory that is not the framework default", async () => {
    const artifacts = await readArtifactsAsync(projectWithMovedArtifacts(), {
      artifactsPath: "./build/arts",
    });
    expect(artifacts.map((a) => a.name)).toEqual(["Counter"]);
  });

  it("resolves a moved output dir from hardhat.config alone, needing no artifactsPath", async () => {
    // The whole point of reading the framework's config: this used to be the error case.
    const artifacts = await readArtifactsAsync(projectWithMovedArtifacts());
    expect(artifacts.map((a) => a.name)).toEqual(["Counter"]);
  });

  it("names the detected toolchain and both fixes when the default dir is absent", async () => {
    // A plain Hardhat project that has not compiled: the config says nothing about paths, so the
    // default is all deployoor has, and either fix could apply.
    const root = mkdtempSync(join(tmpdir(), "deployoor-uncompiled-"));
    writeFileSync(join(root, "hardhat.config.js"), "module.exports = { solidity: '0.8.24' };");

    const error = await readArtifactsAsync(root).catch((e: unknown) => e);
    // Pin the error itself before its prose: a different failure with a coincidentally matching
    // message would otherwise pass, and the repo's convention is to assert specific errors.
    expect(error).toBeInstanceOf(ArtifactsNotFound);
    const message = error instanceof Error ? error.message : String(error);

    expect(message).toContain("This is a Hardhat project (found hardhat.config.js)");
    expect(message).toContain("npx hardhat compile");
    expect(message).toContain("artifactsPath");
  });

  it("points at the configured path, not the default, when artifactsPath itself is wrong", async () => {
    const error = await readArtifactsAsync(projectWithMovedArtifacts(), {
      artifactsPath: "./nope",
    }).catch((e: unknown) => e);
    // Pin the error itself before its prose: a different failure with a coincidentally matching
    // message would otherwise pass, and the repo's convention is to assert specific errors.
    expect(error).toBeInstanceOf(ArtifactsNotFound);
    const message = error instanceof Error ? error.message : String(error);

    expect(message).toContain("nope");
    // Deliberately does not name deployoor.config.ts: `artifactsPath` can also arrive through the
    // programmatic API, and the message must not assert a source it cannot know.
    expect(message).toContain("configured `artifactsPath`");
    expect(message).not.toContain("deployoor.config.ts");
    // Re-suggesting the option the user already set would be noise.
    expect(message).not.toContain("export default defineConfig");
  });

  it("says it could not detect a toolchain, and what it looked for, in a bare directory", async () => {
    const bare = mkdtempSync(join(tmpdir(), "deployoor-bare-"));
    const error = await readArtifactsAsync(bare).catch((e: unknown) => e);
    // Pin the error itself before its prose: a different failure with a coincidentally matching
    // message would otherwise pass, and the repo's convention is to assert specific errors.
    expect(error).toBeInstanceOf(ArtifactsNotFound);
    const message = error instanceof Error ? error.message : String(error);

    expect(message).toContain("Could not tell what this project is built with");
    expect(message).toContain("foundry.toml");
    expect(message).toContain("hardhat.config.ts");
    expect(message).toContain('framework: "hardhat"');
  });

  it("reports a Foundry project by name, with forge build as the compile step", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-foundry-"));
    writeFileSync(join(root, "foundry.toml"), '[profile.default]\nout = "artifacts"\n');
    const error = await readArtifactsAsync(root).catch((e: unknown) => e);
    // Pin the error itself before its prose: a different failure with a coincidentally matching
    // message would otherwise pass, and the repo's convention is to assert specific errors.
    expect(error).toBeInstanceOf(ArtifactsNotFound);
    const message = error instanceof Error ? error.message : String(error);

    expect(message).toContain("This is a Foundry project (found foundry.toml)");
    expect(message).toContain("forge build");
    expect(message).toContain("`out` in foundry.toml");
  });
});
