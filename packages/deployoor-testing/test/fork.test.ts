import { describe, it, expect } from "vitest";
import { erc20Abi, getContract } from "viem";
import { createTestClients } from "../src/index";

// Network-dependent, so it stays out of the default run. Point FORK_RPC at any
// mainnet JSON-RPC endpoint to exercise it:
//   FORK_RPC=https://eth.drpc.org pnpm --filter @deployoor/testing test
const forkRpc = process.env.FORK_RPC;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const FORK_BLOCK = 21_000_000n;

describe.skipIf(forkRpc === undefined)("fork mode", () => {
  it("forks a live chain, keeps prefunded accounts, and reads real remote state", async () => {
    if (forkRpc === undefined) throw new Error("unreachable: guarded by skipIf");
    const { account, publicClient } = await createTestClients({
      fork: { url: forkRpc, blockNumber: FORK_BLOCK },
    });

    // forked at the requested height, not at genesis
    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(FORK_BLOCK);

    // our test account is still funded, even though it holds nothing on mainnet
    expect(await publicClient.getBalance({ address: account.address })).toBeGreaterThan(0n);

    // and real mainnet state is readable through the same viem client
    const usdc = getContract({ address: USDC, abi: erc20Abi, client: publicClient });
    expect(await usdc.read.decimals()).toBe(6);
    expect(await usdc.read.symbol()).toBe("USDC");
  });

  it("seeds committed records onto the fork so getOrDeploy reuses a real address", async () => {
    if (forkRpc === undefined) throw new Error("unreachable: guarded by skipIf");
    const clients = await createTestClients({
      fork: { url: forkRpc, blockNumber: FORK_BLOCK },
      deployments: [
        {
          schemaVersion: 1,
          contractName: "USDC",
          deploymentName: "USDC",
          address: USDC,
          chainId: 1,
          networkName: "1-ethereum",
          abi: [...erc20Abi],
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

    const record = await clients.store.read(`${clients.chain.id}-edr-devnet`, "USDC");
    expect(record?.address).toBe(USDC);
    // the seeded address is live on the fork — the record points at real code.
    // `not.toBe(undefined)` would also pass for "0x", which means no code at all.
    const code = await clients.publicClient.getCode({ address: USDC });
    expect(code).toMatch(/^0x[0-9a-f]{100,}$/);
  });
});
