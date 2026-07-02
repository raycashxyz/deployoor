import { createMemoryClient } from "tevm";
import { padHex, toHex, type Address, type Hex } from "viem";

import {
  computeStorageLocation,
  createFhevmTevmState,
  setAccountCode,
  setInitializableStorage,
  setOwnableStorage,
  setStorageSlot,
} from "../src/index.js";

const contractAddress = "0x0000000000000000000000000000000000001234" as Address;

const readStorageSlot = async (tevm: ReturnType<typeof createMemoryClient>, slot: Hex): Promise<Hex> => {
  const value = await tevm.request({
    method: "eth_getStorageAt",
    params: [contractAddress, slot, "latest"],
  });
  return padHex(value as Hex, { size: 32 });
};

describe("Tevm state helpers", () => {
  it("sets account bytecode through tevmSetAccount", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    await tevm.tevmReady();

    await setAccountCode(tevm, contractAddress, "0x6001600055");

    await expect(tevm.request({ method: "eth_getCode", params: [contractAddress, "latest"] })).resolves.toBe(
      "0x6001600055",
    );
  });

  it("sets arbitrary storage slots without hardhat_setStorageAt", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    await tevm.tevmReady();
    const slot = toHex(0n, { size: 32 });
    const value = toHex(42n, { size: 32 });

    await setStorageSlot(tevm, contractAddress, slot, value);

    await expect(readStorageSlot(tevm, slot)).resolves.toBe(value);
  });

  it("sets the OpenZeppelin initializable storage layout", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    await tevm.tevmReady();
    const slot = computeStorageLocation("openzeppelin.storage.Initializable");

    await setInitializableStorage(tevm, contractAddress, { initialized: 5n, initializing: true });

    await expect(readStorageSlot(tevm, slot)).resolves.toBe(padHex("0x010000000000000005", { size: 32 }));
  });

  it("sets the OpenZeppelin ownable storage layout", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    await tevm.tevmReady();
    const owner = "0x000000000000000000000000000000000000abcd" as Address;
    const slot = computeStorageLocation("openzeppelin.storage.Ownable");

    await setOwnableStorage(tevm, contractAddress, owner);

    await expect(readStorageSlot(tevm, slot)).resolves.toBe(padHex(owner, { size: 32 }));
  });

  it("snapshots and restores Tevm state", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    await tevm.tevmReady();
    const state = createFhevmTevmState(tevm);
    const slot = toHex(1n, { size: 32 });

    await state.setStorageSlot(contractAddress, slot, toHex(1n, { size: 32 }));
    const snapshot = await state.snapshot();
    await state.setStorageSlot(contractAddress, slot, toHex(2n, { size: 32 }));
    await snapshot.restore();

    await expect(readStorageSlot(tevm, slot)).resolves.toBe(toHex(1n, { size: 32 }));
  });
});
