import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineDeployer } from "../../src/engine/deployer";
import { memoryStore } from "../../src/store";
import type { GeneratedArtifact, TypedArtifact } from "../../src/schemas";
import { counterArtifact } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

/**
 * A Hardhat-shaped `artifacts/` tree materialised from a fixture that genuinely deploys.
 *
 * `test/fixtures/hh` exists to exercise the artifact *readers*, and its bytecode is a sample rather
 * than deployable init code — deploying it runs out of gas. `counterArtifact` from test/fixtures is
 * the one compiled for the EVM tests, so this writes that artifact into the layout the Hardhat adapter
 * expects, which is what lets one test cover generate-shape → resolve → deploy → record.
 */
const materialiseArtifacts = (root: string, artifact: TypedArtifact): void => {
  const [sourceName, contractName] = artifact.metadata.fullyQualifiedName.split(":");
  if (sourceName === undefined || contractName === undefined) throw new Error("bad fqn");

  const contractDir = join(root, "artifacts", sourceName);
  mkdirSync(contractDir, { recursive: true });
  mkdirSync(join(root, "artifacts", "build-info"), { recursive: true });
  writeFileSync(join(root, "hardhat.config.js"), "module.exports = { solidity: '0.8.24' };");

  writeFileSync(
    join(contractDir, `${contractName}.json`),
    JSON.stringify({
      _format: "hh-sol-artifact-1",
      contractName,
      sourceName,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
      linkReferences: {},
      deployedLinkReferences: {},
    }),
  );
  // From `artifacts/<sourceName>/` back up to `artifacts/` is exactly one `..` per segment of the
  // source name. One too many silently yields no build-info, and the adapter then reports an empty
  // compiler version rather than failing — which is how this was caught.
  const relativeToBuildInfo = `${"../".repeat(sourceName.split("/").length)}build-info/test.json`;
  writeFileSync(
    join(contractDir, `${contractName}.dbg.json`),
    JSON.stringify({ _format: "hh-sol-dbg-1", buildInfo: relativeToBuildInfo }),
  );
  writeFileSync(
    join(root, "artifacts", "build-info", "test.json"),
    JSON.stringify({
      _format: "hh-sol-build-info-1",
      id: "test",
      solcVersion: artifact.metadata.compilerVersion.split("+")[0],
      solcLongVersion: artifact.metadata.compilerVersion,
      input: artifact.metadata.standardJsonInput,
      output: { contracts: {}, sources: {} },
    }),
  );
};

/** Exactly what `deployoor generate` emits: an abi and a name, nothing that could deploy alone. */
const thin = {
  name: counterArtifact.name,
  fullyQualifiedName: counterArtifact.metadata.fullyQualifiedName,
  abi: counterArtifact.abi,
} satisfies GeneratedArtifact;

/** Clients plus the deployer address, narrowed once — viem types `account` as optional. */
const clientsWithDeployer = async () => {
  const clients = await makeEvmClients();
  const account = clients.walletClient.account;
  if (account === undefined) throw new Error("test wallet client has no account");
  return { ...clients, deployer: account.address };
};

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

/** A throwaway project, entered as the working directory — the documented project root. */
const enterProject = (): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-thin-deploy-"));
  materialiseArtifacts(root, counterArtifact);
  process.chdir(root);
  return root;
};

describe("deploying from a generated (thin) artifact", () => {
  it("reads bytecode from the compiled artifact and records the deploy", async () => {
    // The end-to-end claim of the change: a deployer that commits only an abi can still deploy,
    // because the pipeline loads everything else from `artifacts/` at call time.
    enterProject();
    const clients = await clientsWithDeployer();
    const store = memoryStore();
    const getOrDeployCounter = defineDeployer(thin, { deploymentsPath: "./deployments" });

    const { contract, freshDeploy, deployment } = await getOrDeployCounter({
      ...clients,
      store,
      args: [7n, clients.deployer],
    });

    expect(freshDeploy).toBe(true);
    expect(contract.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Read back through the typed contract, proving the abi survived resolution.
    expect(await contract.read.count()).toBe(7n);
    // The record carries what only the compiled artifact could supply.
    expect(deployment.bytecode).toMatch(/^0x60/);
    expect(deployment.compiler.version).toBe(counterArtifact.metadata.compilerVersion);
    expect(deployment.sourcesHash).toMatch(/^0x/);
  });

  it("is still idempotent: the second call sends no transaction", async () => {
    enterProject();
    const clients = await clientsWithDeployer();
    const store = memoryStore();
    const getOrDeployCounter = defineDeployer(thin, { deploymentsPath: "./deployments" });
    const args = [7n, clients.deployer] as const;

    const first = await getOrDeployCounter({ ...clients, store, args: [...args] });
    const second = await getOrDeployCounter({ ...clients, store, args: [...args] });

    expect(first.freshDeploy).toBe(true);
    expect(second.freshDeploy).toBe(false);
    expect(second.contract.address).toBe(first.contract.address);
  });

  it("reads artifacts and writes records against the same directory after a chdir", async () => {
    // Both paths deployoor resolves against the working directory must read it at the same moment.
    // Resolving the store when the deployer was defined, while artifacts resolved when it was called,
    // meant a chdir in between sent records to one project and read artifacts from another.
    const first = enterProject();
    const getOrDeployCounter = defineDeployer(thin, { deploymentsPath: "./deployments" });

    // Move to a second, independently compiled project *after* defining the deployer.
    const second = enterProject();
    const clients = await clientsWithDeployer();

    const { deployment } = await getOrDeployCounter({
      ...clients,
      args: [7n, clients.deployer],
    });

    // The record landed under the directory in effect at call time, not definition time.
    expect(existsSync(join(second, "deployments"))).toBe(true);
    expect(existsSync(join(first, "deployments"))).toBe(false);
    expect(deployment.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("refuses to deploy when nothing has been compiled", async () => {
    // 02's decision made visible at the point it matters: no artifacts means no deploy, loudly.
    const root = enterProject();
    rmSync(join(root, "artifacts"), { recursive: true, force: true });
    const clients = await clientsWithDeployer();
    const getOrDeployCounter = defineDeployer(thin, { deploymentsPath: "./deployments" });

    await expect(
      getOrDeployCounter({ ...clients, store: memoryStore(), args: [7n, clients.deployer] }),
    ).rejects.toThrow(/No compiled artifacts/);
  });
});
