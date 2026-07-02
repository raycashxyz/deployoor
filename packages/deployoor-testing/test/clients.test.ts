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

  it("passes tevm options through (miningConfig override still boots)", async () => {
    const { account, publicClient } = await createTestClients({ miningConfig: { type: "auto" } });
    expect(await publicClient.getBalance({ address: account.address })).toBeGreaterThan(0n);
  });

  it("provides a fresh in-memory store so deploys never touch disk", async () => {
    const { store } = await createTestClients();
    expect(await store.read("anynet", "Anything")).toBeNull();
    expect(await store.list("anynet")).toEqual([]);
  });

  it("exposes tevm and cheatcodes for EVM control", async () => {
    const { accounts, publicClient, tevm, cheatcodes } = await createTestClients();
    const [, other] = accounts;

    expect(typeof tevm.tevmDumpState).toBe("function");
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
    const record = await clients.store.read(`${clients.chain.id}-tevm-devnet`, "Token");
    expect(record?.address).toBe("0x00000000000000000000000000000000000000c0");
    expect(record?.chainId).toBe(clients.chain.id);

    // …and the REAL reuse path works: a generated deployer returns the seeded
    // contract with no transaction instead of redeploying.
    const artifact: TypedArtifact = {
      name: "Token",
      abi: [],
      bytecode: "0x60",
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
