import { describe, it, expect } from "vitest";
import { createEvmNode } from "../src/index";

describe("createEvmNode", () => {
  it("exposes a prefunded, ready EVM as viem clients", async () => {
    const { account, accounts, chain, publicClient, walletClient } = await createEvmNode();

    expect(accounts.length).toBeGreaterThanOrEqual(2);
    expect(walletClient.account?.address).toBe(account.address);
    expect(chain.id).toBe(31337);
    expect(await publicClient.getBalance({ address: account.address })).toBeGreaterThan(0n);
  });

  it("runs many independent EVMs concurrently without cross-talk", async () => {
    const instances = await Promise.all(Array.from({ length: 12 }, () => createEvmNode()));
    expect(instances).toHaveLength(12);

    // cacheTime: 0 — viem caches the block number for `pollingInterval` (4s) by default,
    // which would serve a stale 0 after the transactions below.
    // Each chain starts at block 0 — proof they are separate EVMs, not one shared node.
    const startBlocks = await Promise.all(
      instances.map((node) => node.publicClient.getBlockNumber({ cacheTime: 0 })),
    );
    expect(startBlocks).toEqual(Array.from({ length: 12 }, () => 0n));

    // Advance only the even-indexed chains, concurrently.
    await Promise.all(
      instances.map((node, index) =>
        index % 2 === 0
          ? node.walletClient.sendTransaction({
              account: node.account,
              chain: null,
              to: "0x0000000000000000000000000000000000000001",
              value: 1n,
            })
          : Promise.resolve(undefined),
      ),
    );

    const endBlocks = await Promise.all(
      instances.map((node) => node.publicClient.getBlockNumber({ cacheTime: 0 })),
    );
    // compared as arrays, so a failure names the chain that drifted
    expect(endBlocks).toEqual(Array.from({ length: 12 }, (_unused, index) => (index % 2 === 0 ? 1n : 0n)));
  });

  it("restores state through snapshot and revert, and consumes the id", async () => {
    const { account, publicClient, cheatcodes } = await createEvmNode();

    await cheatcodes.setBalance(account.address, 1n);
    const id = await cheatcodes.snapshot();
    await cheatcodes.setBalance(account.address, 2n);
    expect(await publicClient.getBalance({ address: account.address })).toBe(2n);

    expect(await cheatcodes.revert(id)).toBe(true);
    expect(await publicClient.getBalance({ address: account.address })).toBe(1n);
    // the id is spent by the revert above — a second one cannot restore anything
    expect(await cheatcodes.revert(id)).toBe(false);
  });
});
