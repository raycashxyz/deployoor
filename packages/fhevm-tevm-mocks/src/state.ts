import type { DumpStateResult, LoadStateResult, MineParams, SetAccountParams } from "tevm";
import {
  encodeAbiParameters,
  isAddress,
  isHex,
  keccak256,
  padHex,
  stringToBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";

import { assertFhevmTevm, assertNoTevmErrors } from "./errors.js";

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const uint256LowByteMask = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00");

export type SerializableTevmState = DumpStateResult["state"];

export interface TevmActionResult {
  readonly errors?: readonly unknown[];
}

export interface TevmStateClient {
  tevmDeal(params: {
    readonly account: Address;
    readonly amount: bigint;
    readonly erc20?: Address;
  }): Promise<TevmActionResult>;
  tevmDumpState(): Promise<DumpStateResult>;
  tevmLoadState(params: { readonly state: SerializableTevmState }): Promise<LoadStateResult>;
  tevmMine(params?: MineParams): Promise<TevmActionResult>;
  tevmSetAccount(params: SetAccountParams): Promise<TevmActionResult>;
}

export interface FhevmTevmState {
  readonly setBalance: (address: Address, amount: bigint) => Promise<void>;
  readonly deal: (params: {
    readonly account: Address;
    readonly amount: bigint;
    readonly erc20?: Address;
  }) => Promise<void>;
  readonly mine: (params?: MineParams) => Promise<void>;
  readonly setAccount: (params: SetAccountParams) => Promise<void>;
  readonly setCode: (address: Address, deployedBytecode: Hex) => Promise<void>;
  readonly setStorageSlot: (address: Address, slot: bigint | Hex, value: Hex) => Promise<void>;
  readonly setInitializableStorage: (
    contractAddress: Address,
    value: { readonly initialized: bigint; readonly initializing: boolean },
  ) => Promise<void>;
  readonly setOwnableStorage: (contractAddress: Address, ownerAddress: Address) => Promise<void>;
  readonly dumpState: () => Promise<SerializableTevmState>;
  readonly loadState: (state: SerializableTevmState) => Promise<void>;
  readonly snapshot: () => Promise<FhevmTevmStateSnapshot>;
}

export interface FhevmTevmStateSnapshot {
  readonly state: SerializableTevmState;
  restore(): Promise<void>;
}

export const computeStorageLocation = (storageName: string): Hex => {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }],
    [BigInt(keccak256(stringToBytes(storageName))) - 1n],
  );
  return toHex(BigInt(keccak256(encoded)) & uint256LowByteMask, { size: 32 });
};

export const toStorageSlot = (slot: bigint | Hex): Hex => {
  const normalized = typeof slot === "bigint" ? toHex(slot, { size: 32 }) : slot;
  assertFhevmTevm(bytes32Pattern.test(normalized), `Expected a 32-byte storage slot, got ${normalized}`);
  return normalized;
};

export const toStorageValue = (value: Hex): Hex => {
  assertFhevmTevm(isHex(value), `Expected a hex storage value, got ${value}`);
  return padHex(value, { size: 32 });
};

export const setAccountCode = async (
  tevm: Pick<TevmStateClient, "tevmSetAccount">,
  address: Address,
  deployedBytecode: Hex,
): Promise<void> => {
  assertFhevmTevm(isAddress(address), `Invalid address: ${address}`);
  assertFhevmTevm(isHex(deployedBytecode), `Expected hex bytecode for ${address}`);
  const result = await tevm.tevmSetAccount({ address, deployedBytecode });
  assertNoTevmErrors(result);
};

export const setStorageSlot = async (
  tevm: Pick<TevmStateClient, "tevmSetAccount">,
  address: Address,
  slot: bigint | Hex,
  value: Hex,
): Promise<void> => {
  assertFhevmTevm(isAddress(address), `Invalid address: ${address}`);
  const result = await tevm.tevmSetAccount({
    address,
    stateDiff: {
      [toStorageSlot(slot)]: toStorageValue(value),
    },
  });
  assertNoTevmErrors(result);
};

export const setInitializableStorage = async (
  tevm: Pick<TevmStateClient, "tevmSetAccount">,
  contractAddress: Address,
  value: { readonly initialized: bigint; readonly initializing: boolean },
): Promise<void> => {
  const storageLocation = computeStorageLocation("openzeppelin.storage.Initializable");
  assertFhevmTevm(
    storageLocation === "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00",
    "Wrong 'openzeppelin.storage.Initializable' storage location",
  );
  assertFhevmTevm(
    value.initialized >= 0n && value.initialized <= 0xffffffffffffffffn,
    "initialized must fit uint64",
  );

  const initializedBytes = toHex(value.initialized, { size: 8 }).slice(2);
  const initializingByte = value.initializing ? "01" : "00";
  const packedSlotValue = padHex(`0x${initializingByte}${initializedBytes}`, { size: 32 });

  await setStorageSlot(tevm, contractAddress, storageLocation, packedSlotValue);
};

export const setOwnableStorage = async (
  tevm: Pick<TevmStateClient, "tevmSetAccount">,
  contractAddress: Address,
  ownerAddress: Address,
): Promise<void> => {
  const storageLocation = computeStorageLocation("openzeppelin.storage.Ownable");
  assertFhevmTevm(
    storageLocation === "0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300",
    "Wrong 'openzeppelin.storage.Ownable' storage location",
  );
  assertFhevmTevm(isAddress(ownerAddress), `Invalid owner address: ${ownerAddress}`);

  await setStorageSlot(tevm, contractAddress, storageLocation, padHex(ownerAddress, { size: 32 }));
};

export const createFhevmTevmState = (tevm: TevmStateClient): FhevmTevmState => ({
  async setBalance(address, amount) {
    const result = await tevm.tevmDeal({ account: address, amount });
    assertNoTevmErrors(result);
  },
  async deal(params) {
    const result = await tevm.tevmDeal(params);
    assertNoTevmErrors(result);
  },
  async mine(params) {
    const result = await tevm.tevmMine(params);
    assertNoTevmErrors(result);
  },
  async setAccount(params) {
    const result = await tevm.tevmSetAccount(params);
    assertNoTevmErrors(result);
  },
  async setCode(address, deployedBytecode) {
    await setAccountCode(tevm, address, deployedBytecode);
  },
  async setStorageSlot(address, slot, value) {
    await setStorageSlot(tevm, address, slot, value);
  },
  async setInitializableStorage(contractAddress, value) {
    await setInitializableStorage(tevm, contractAddress, value);
  },
  async setOwnableStorage(contractAddress, ownerAddress) {
    await setOwnableStorage(tevm, contractAddress, ownerAddress);
  },
  async dumpState() {
    const result = await tevm.tevmDumpState();
    assertNoTevmErrors(result);
    return result.state;
  },
  async loadState(state) {
    const result = await tevm.tevmLoadState({ state });
    assertNoTevmErrors(result);
  },
  async snapshot() {
    const state = await this.dumpState();
    return {
      state,
      restore: async () => {
        await this.loadState(state);
      },
    };
  },
});
