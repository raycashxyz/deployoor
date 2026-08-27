import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWalletClient, custom, zeroAddress } from "viem";
import type { Chain } from "viem";
import { defineConfig, defineDeployer, defineRegister, defineReset } from "../../src/index";
import { networkKeyForChain } from "../../src/store";
import { counterArtifact } from "../fixtures";
import { makeEvmClients } from "../evm-clients";

const network = (chain: Chain | undefined): string => {
  if (chain === undefined) throw new Error("client missing chain");
  return networkKeyForChain(chain);
};

// Exercises the actual user flow: `deployoor generate` would emit a file equivalent to
//   export const getOrDeployCounter = defineDeployer(counterArtifact, config)
// and the user calls it with a viem client. No createDeployer, no store wiring.
describe("defineDeployer (the generated-deployer entry point)", () => {
  it("deploys with just a viem client and writes a record to the configured path", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const getOrDeployCounter = defineDeployer(counterArtifact, defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const { contract: counter, freshDeploy } = await getOrDeployCounter({
      walletClient,
      publicClient,
      args: [42n, account],
    });

    expect(freshDeploy).toBe(true);
    expect(await counter.read.count()).toBe(42n);
    const chainDir = join(deploymentsPath, network(walletClient.chain));
    expect(existsSync(join(chainDir, "Counter.json"))).toBe(true);
  });

  it("is idempotent across separate deployer calls sharing the config path", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const getOrDeployCounter = defineDeployer(counterArtifact, defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const first = await getOrDeployCounter({ walletClient, publicClient, args: [1n, account] });
    const before = await publicClient.getTransactionCount({ address: account });
    const second = await getOrDeployCounter({ walletClient, publicClient, args: [1n, account] });
    const after = await publicClient.getTransactionCount({ address: account });

    expect(first.freshDeploy).toBe(true);
    expect(second.freshDeploy).toBe(false);
    expect(second.contract.address).toBe(first.contract.address);
    expect(after).toBe(before);
  });
});

describe("defineRegister / defineReset (project-level entry points)", () => {
  it("register records an external contract with no transaction and returns its viem object", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const before = await publicClient.getTransactionCount({ address: account });
    const {
      contract: usdc,
      freshDeploy,
      receipt,
    } = await register({
      walletClient,
      publicClient,
      deploymentName: "USDC",
      address: account,
      abi: counterArtifact.abi,
    });
    const after = await publicClient.getTransactionCount({ address: account });

    expect(usdc.address).toBe(account);
    expect(freshDeploy).toBe(false); // register never deploys
    expect(receipt).toBeUndefined();
    expect(after).toBe(before); // recorded, not deployed — no tx
    const chainDir = join(deploymentsPath, network(walletClient.chain));
    expect(existsSync(join(chainDir, "USDC.json"))).toBe(true);
  });

  it("reset forgets a recorded deployment so the next getOrDeploy redeploys", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const config = defineConfig({ deploymentsPath });
    const getOrDeployCounter = defineDeployer(counterArtifact, config);
    const reset = defineReset(config);

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient };
    const chainDir = join(deploymentsPath, network(walletClient.chain));

    const first = await getOrDeployCounter({ ...clients, args: [1n, account] });
    expect(existsSync(join(chainDir, "Counter.json"))).toBe(true);

    await reset({ publicClient, deploymentName: "Counter" }); // reset needs only a public client — no signer
    expect(existsSync(join(chainDir, "Counter.json"))).toBe(false);

    const second = await getOrDeployCounter({ ...clients, args: [1n, account] });
    expect(second.freshDeploy).toBe(true); // record gone → fresh deploy
    expect(second.contract.address).not.toBe(first.contract.address);
  });

  it("register refuses to overwrite a real deployment", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const config = defineConfig({ deploymentsPath });
    const getOrDeployCounter = defineDeployer(counterArtifact, config);
    const register = defineRegister(config);

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient };
    await getOrDeployCounter({ ...clients, args: [1n, account] }); // real deployment named "Counter"

    await expect(
      register({ ...clients, name: "Counter", address: account, abi: counterArtifact.abi }),
    ).rejects.toThrow(/already exists/);
  });

  it("register updates a prior registration without error", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient };
    await register({ ...clients, name: "USDC", address: account, abi: counterArtifact.abi });
    const again = await register({ ...clients, name: "USDC", address: account, abi: counterArtifact.abi });
    expect(again.contract.address).toBe(account); // re-registering an external record is allowed
  });

  it("register logs a moved address in history and leaves an unchanged re-register alone", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));
    const other = `0x${"ab".repeat(20)}` as const;

    const { address: account, walletClient, publicClient } = await makeEvmClients();
    const clients = { walletClient, publicClient, name: "USDC", abi: counterArtifact.abi };
    const first = await register({ ...clients, address: account });
    expect(first.deployment.history).toHaveLength(1);

    // Re-registering the same address records nothing new — otherwise every script run would
    // append an identical entry.
    const same = await register({ ...clients, address: account });
    expect(same.deployment.history).toHaveLength(1);

    const moved = await register({ ...clients, address: other });
    expect(moved.deployment.history).toHaveLength(2); // appended, not replaced
    expect(moved.deployment.history?.[1]?.supersededAddress).toBe(account);
  });

  // Deliberately not rejected. A wallet client with no account cannot be the registrant and
  // cannot send a transaction, but `register` only writes a record, so failing here would break
  // a call that works today. The consequence is carried in the type instead: this client resolves
  // to an `UnboundContract`, whose writes must pass `{ account, chain }` explicitly — pinned in
  // `test/codegen/emitted-typecheck.test.ts`, since it is a compile-time property.
  it("register accepts a wallet client with no account and records the zero-address deployer", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));

    const { address: external, publicClient, chain } = await makeEvmClients();
    // Same EVM, no hoisted account — the shape an injected browser wallet has before a connect.
    const accountless = createWalletClient({ chain, transport: custom({ request: publicClient.request }) });
    expect(accountless.account).toBeUndefined();

    const record = join(deploymentsPath, network(chain), "USDC.json");
    expect(existsSync(record)).toBe(false);

    const { contract, deployment } = await register({
      walletClient: accountless,
      publicClient,
      deploymentName: "USDC",
      address: external,
      abi: counterArtifact.abi,
    });

    expect(deployment.deployer).toBe(zeroAddress);
    expect(deployment.kind).toBe("external");
    expect(contract.address).toBe(external);
    // Read it off disk too: the zero-address deployer has to be what was *persisted*, not just
    // what the call resolved to, since that record is what a later `getOrDeploy` reuses.
    const persisted = JSON.parse(readFileSync(record, "utf8"));
    expect(persisted.address).toBe(external);
    expect(persisted.kind).toBe("external");
    expect(persisted.deployer).toBe(zeroAddress);
  });

  it("register works with only a public client (no signer) and records the zero-address deployer", async () => {
    const deploymentsPath = mkdtempSync(join(tmpdir(), "deployoor-"));
    const register = defineRegister(defineConfig({ deploymentsPath }));

    const { address: external, publicClient } = await makeEvmClients();
    const { contract, freshDeploy, deployment } = await register({
      publicClient, // no walletClient — register records an existing address, so a public client suffices
      deploymentName: "USDC",
      address: external,
      abi: counterArtifact.abi,
    });

    expect(freshDeploy).toBe(false);
    expect(contract.address).toBe(external);
    expect(deployment.kind).toBe("external");
    expect(deployment.deployer).toBe("0x0000000000000000000000000000000000000000");
    const chainDir = join(deploymentsPath, network(publicClient.chain));
    expect(existsSync(join(chainDir, "USDC.json"))).toBe(true);
  });
});
