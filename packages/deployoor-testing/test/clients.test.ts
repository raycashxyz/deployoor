import { describe, it, expect } from "vitest";
import { defineConfig, defineDeployer, type TypedArtifact } from "deployoor";
import { createFixture, createTestClients } from "../src/index";

describe("createTestClients", () => {
  it("exposes a prefunded, ready in-memory EVM as viem clients", async () => {
    const { account, chain, walletClient, publicClient } = await createTestClients();

    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(chain.id).toBeGreaterThan(0);
    expect(walletClient.account?.address).toBe(account.address);

    // it's a real, ready EVM: the account is prefunded and blocks advance
    const balance = await publicClient.getBalance({ address: account.address });
    expect(balance).toBeGreaterThan(0n);
    expect(await publicClient.getBlockNumber()).toBeGreaterThanOrEqual(0n);
  });

  it("exposes multiple prefunded accounts + a wallet-client factory for multi-party tests", async () => {
    const { accounts, walletClientFor, publicClient } = await createTestClients();
    expect(accounts.length).toBeGreaterThanOrEqual(2);

    const [owner, other] = accounts;

    const ownerWallet = walletClientFor(owner);
    const otherWallet = walletClientFor(other);

    // distinct signers on the same chain, both prefunded
    expect(ownerWallet.account?.address).toBe(owner.address);
    expect(otherWallet.account?.address).toBe(other.address);
    expect(otherWallet.account?.address).not.toBe(ownerWallet.account?.address);
    expect(await publicClient.getBalance({ address: other.address })).toBeGreaterThan(0n);
  });

  it("passes EVM options through to the chain itself", async () => {
    const { chain, publicClient } = await createTestClients({ chainId: 1337 });
    // asserts the option reached the EVM, not just that the client booted
    expect(chain.id).toBe(1337);
    expect(await publicClient.getChainId()).toBe(1337);
  });

  it("leaves blocks unmined when autoMine is off", async () => {
    const clients = await createTestClients({ autoMine: false });
    const { account, publicClient, walletClient, cheatcodes } = clients;
    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(0n);

    await walletClient.sendTransaction({
      account,
      chain: null,
      to: "0x0000000000000000000000000000000000000001",
      value: 1n,
    });
    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(0n); // still pending

    await cheatcodes.mine();
    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(1n);
  });

  it("enforces blockGasLimit on mined blocks, not just on genesis", async () => {
    // EDR only enforces the limit in the mem pool, miner and REVM when it is set on the
    // mining config. Setting network.genesisBlockGasLimit alone sizes the genesis block
    // and leaves every mined block unbounded, so this asserts the option actually binds.
    const { account, walletClient } = await createTestClients({ blockGasLimit: 100_000n });

    await expect(
      walletClient.sendTransaction({
        account,
        chain: null,
        to: "0x0000000000000000000000000000000000000001",
        value: 1n,
        gas: 500_000n,
      }),
      // the exact EDR message, so an unrelated failure cannot pass this test
    ).rejects.toThrow(/Transaction gas limit is 500000 and exceeds block gas limit of 100000/);
  });

  it("provides a fresh in-memory store so deploys never touch disk", async () => {
    const { store } = await createTestClients();
    expect(await store.read("anynet", "Anything")).toBeNull();
    expect(await store.list("anynet")).toEqual([]);
  });

  it("exposes the raw provider and cheatcodes for EVM control", async () => {
    const { accounts, publicClient, provider, cheatcodes } = await createTestClients();
    const [, other] = accounts;

    // the escape hatch: any RPC the EVM supports, not just the wrapped cheatcodes
    expect(await provider.request({ method: "web3_clientVersion" })).toMatch(/edr/i);
    await cheatcodes.setBalance(other.address, 123n);
    expect(await publicClient.getBalance({ address: other.address })).toBe(123n);
  });

  it("restores EVM state with createFixture", async () => {
    const clients = await createTestClients();
    const { account, publicClient, cheatcodes } = clients;
    const useFundedAccount = createFixture(async (fixtureClients) => {
      await fixtureClients.cheatcodes.setBalance(account.address, 100n);
      return { address: account.address };
    });

    await useFundedAccount(clients);
    expect(await publicClient.getBalance({ address: account.address })).toBe(100n);
    await cheatcodes.setBalance(account.address, 1n);
    expect(await publicClient.getBalance({ address: account.address })).toBe(1n);

    await useFundedAccount(clients);
    expect(await publicClient.getBalance({ address: account.address })).toBe(100n);
  });

  it("keeps one fixture's snapshot per clients instance, so a second EVM still runs setup", async () => {
    // A snapshot id only means something on the provider that issued it. Sharing one
    // cache across instances reverts the second EVM with the first one's id, which
    // resolves false and would hand back a value that was never applied to it.
    const first = await createTestClients();
    const second = await createTestClients();
    const useFunded = createFixture(async (clients) => {
      await clients.cheatcodes.setBalance(clients.account.address, 100n);
      return "funded";
    });

    expect(await first.publicClient.getBalance({ address: first.account.address })).not.toBe(100n);
    await useFunded(first);
    expect(await first.publicClient.getBalance({ address: first.account.address })).toBe(100n);

    expect(await second.publicClient.getBalance({ address: second.account.address })).not.toBe(100n);
    await useFunded(second);
    expect(await second.publicClient.getBalance({ address: second.account.address })).toBe(100n);
  });

  it("seeds production records so getOrDeploy reuses them without a transaction", async () => {
    const clients = await createTestClients({
      deployments: [
        {
          schemaVersion: 1,
          contractName: "Token",
          deploymentName: "Token",
          address: "0x00000000000000000000000000000000000000c0",
          chainId: 1, // recorded on mainnet — the fork-test scenario
          networkName: "1-ethereum",
          abi: [],
          bytecode: "0x60",
          constructorArgs: [],
          transactionHash: "0x",
          deployer: "0x000000000000000000000000000000000000dead",
          deployedAt: 0,
          compiler: { version: "0.8.24" },
          kind: "standard",
        },
      ],
    });

    // The record is remapped onto the in-memory chain (networkName AND chainId — the
    // pipeline's chain-mismatch guard would otherwise reject the reuse)…
    const record = await clients.store.read(`${clients.chain.id}-edr-devnet`, "Token");
    expect(record?.address).toBe("0x00000000000000000000000000000000000000c0");
    expect(record?.chainId).toBe(clients.chain.id);

    // …and the REAL reuse path works: a generated deployer returns the seeded
    // contract with no transaction instead of redeploying.
    const artifact: TypedArtifact = {
      name: "Token",
      abi: [],
      bytecode: "0x60",
      deployedBytecode: "0x60",
      metadata: {
        fullyQualifiedName: "Token.sol:Token",
        compilerVersion: "0.8.24",
        standardJsonInput: { language: "Solidity", sources: {}, settings: {} },
        libraryPlaceholders: {},
      },
    };
    const getOrDeployToken = defineDeployer(artifact, defineConfig({}));
    const before = await clients.publicClient.getTransactionCount({ address: clients.account.address });
    const { contract: token, freshDeploy } = await getOrDeployToken({ ...clients, args: [] as never });
    const after = await clients.publicClient.getTransactionCount({ address: clients.account.address });

    expect(freshDeploy).toBe(false); // seeded record reused — no deploy
    expect(token.address).toBe("0x00000000000000000000000000000000000000c0");
    expect(after).toBe(before);
  });
});
