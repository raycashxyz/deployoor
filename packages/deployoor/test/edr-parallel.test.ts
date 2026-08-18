import { describe, it, expect } from "vitest";
import { makeEvmClients } from "./evm-clients";

describe("parallel in-memory chains", () => {
  it("runs many independent EVMs concurrently without cross-talk", async () => {
    const instances = await Promise.all(Array.from({ length: 12 }, () => makeEvmClients()));
    expect(instances).toHaveLength(12);

    // cacheTime: 0 — viem caches the block number for `pollingInterval` (4s) by default,
    // which would serve a stale 0 after the transactions below.
    // Each chain starts at block 0 — proof they are separate EVMs, not one shared node.
    const startBlocks = await Promise.all(
      instances.map((clients) => clients.publicClient.getBlockNumber({ cacheTime: 0 })),
    );
    expect(startBlocks.every((block) => block === 0n)).toBe(true);

    // Advance only the even-indexed chains, concurrently.
    await Promise.all(
      instances.map((clients, index) =>
        index % 2 === 0
          ? clients.walletClient.sendTransaction({
              account: clients.account,
              chain: null,
              to: "0x0000000000000000000000000000000000000001",
              value: 1n,
            })
          : Promise.resolve(undefined),
      ),
    );

    const endBlocks = await Promise.all(
      instances.map((clients) => clients.publicClient.getBlockNumber({ cacheTime: 0 })),
    );
    expect(endBlocks.filter((_, index) => index % 2 === 0).every((block) => block === 1n)).toBe(true);
    expect(endBlocks.filter((_, index) => index % 2 === 1).every((block) => block === 0n)).toBe(true);
  });
});
