import { describe, it, expect } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveArtifact } from "../../src/artifacts/resolve";
import { ArtifactsNotFound, ContractArtifactNotFound, GeneratedArtifactStale } from "../../src/errors";
import type { GeneratedArtifact } from "../../src/schemas";
import { readHardhatArtifacts } from "../../src/artifacts/hardhat";
import { counterArtifact } from "../fixtures";

const hhFixture = join(import.meta.dirname, "..", "fixtures", "hh");

/** A copy of the Hardhat fixture, so a test may delete its artifacts without affecting others. */
const project = (): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-resolve-"));
  cpSync(hhFixture, root, { recursive: true });
  return root;
};

/**
 * What `generate` emits for the fixture's Counter, derived from the fixture itself rather than
 * hand-written. Writing the abi by hand made the test assert an interface the fixture does not have —
 * which the drift check duly rejected. Deriving it keeps the test about resolution, and means a
 * change to the fixture cannot silently turn these into drift tests.
 */
const compiled = readHardhatArtifacts(join(hhFixture, "artifacts"))[0];
if (compiled === undefined) throw new Error("fixture has no compiled artifacts");

const thin: GeneratedArtifact = {
  name: compiled.name,
  fullyQualifiedName: compiled.metadata.fullyQualifiedName,
  abi: compiled.abi,
};

/**
 * The same interface with solc's entry order varied. Enough to prove the resolver compares
 * canonically rather than by document equality; `internalType` and key-order insensitivity are
 * covered directly in abi-identity.test.ts, where hand-written literals keep the types simple.
 */
const reordered: GeneratedArtifact = { ...thin, abi: [...compiled.abi].reverse() };

/** Valid hex, or the bytecode schema rejects the artifact and the adapter drops it entirely. */
const RECOMPILED_BYTECODE = "0x6080deadbeef";

describe("resolveArtifact", () => {
  it("returns a full artifact untouched, without reading the filesystem", async () => {
    // The path `@deployoor/testing` and in-memory compilation rely on: there is no project here at
    // all, so any disk access would fail rather than silently succeed.
    const resolved = await resolveArtifact(counterArtifact, { root: join(tmpdir(), "does-not-exist") });

    expect(resolved).toBe(counterArtifact);
  });

  it("loads bytecode and metadata from the compiled artifact for a generated one", async () => {
    const resolved = await resolveArtifact(thin, { root: project() });

    expect(resolved.bytecode).toMatch(/^0x60/);
    expect(resolved.deployedBytecode).toMatch(/^0x/);
    expect(resolved.metadata.fullyQualifiedName).toBe("contracts/Counter.sol:Counter");
    expect(resolved.metadata.standardJsonInput.sources).toHaveProperty("contracts/Counter.sol");
    // The abi is the generated literal, so the precise type survives.
    expect(resolved.abi).toBe(thin.abi);
  });

  it("names the contract and what was compiled when the fqn is not there", async () => {
    const missing = { ...thin, fullyQualifiedName: "contracts/Gone.sol:Gone" };

    const error = await resolveArtifact(missing, { root: project() }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContractArtifactNotFound);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain("contracts/Gone.sol:Gone");
    expect(message).toContain("contracts/Counter.sol:Counter"); // what was found instead
    expect(message).toContain("deployoor generate");
  });

  it("refuses to deploy when the generated abi has drifted, and says what moved", async () => {
    // The hazard this whole seam exists for: without it, args would be encoded against the stale
    // interface and the stale abi written into the record.
    const stale: GeneratedArtifact = {
      ...thin,
      abi: [
        ...thin.abi,
        { type: "function", name: "gone", inputs: [], outputs: [], stateMutability: "view" },
      ],
    };

    const error = await resolveArtifact(stale, { root: project() }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GeneratedArtifactStale);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain("no longer matches");
    expect(message).toContain("- function gone() view");
    expect(message).toContain("deployoor generate");
  });

  it("ignores entry order, which solc is free to vary", async () => {
    // Document equality would reject this; canonical comparison must not.
    await expect(resolveArtifact(reordered, { root: project() })).resolves.toHaveProperty("bytecode");
  });

  it("sees a recompile, rather than reusing an earlier read", async () => {
    // The staleness a per-process cache reintroduced: only the abi is compared, so a bytecode-only
    // change would have deployed the old code and pinned the old sources, silently.
    const root = project();
    const first = await resolveArtifact(thin, { root });

    const artifactPath = join(root, "artifacts", "contracts", "Counter.sol", "Counter.json");
    const onDisk = JSON.parse(readFileSync(artifactPath, "utf8")) as Record<string, unknown>;
    writeFileSync(artifactPath, JSON.stringify({ ...onDisk, bytecode: RECOMPILED_BYTECODE }));

    const second = await resolveArtifact(thin, { root });

    expect(first.bytecode).not.toBe(RECOMPILED_BYTECODE);
    expect(second.bytecode).toBe(RECOMPILED_BYTECODE);
  });

  it("recovers once artifacts appear, rather than repeating an earlier failure", async () => {
    // A cached *rejection* used to poison every later resolve in the process, so a script that
    // resolved before compiling could never succeed afterwards.
    const root = project();
    const artifacts = join(root, "artifacts");
    const saved = mkdtempSync(join(tmpdir(), "deployoor-saved-"));
    cpSync(artifacts, join(saved, "artifacts"), { recursive: true });
    rmSync(artifacts, { recursive: true, force: true });

    await expect(resolveArtifact(thin, { root })).rejects.toThrowError(ArtifactsNotFound);

    cpSync(join(saved, "artifacts"), artifacts, { recursive: true });

    await expect(resolveArtifact(thin, { root })).resolves.toHaveProperty("bytecode");
  });
});
