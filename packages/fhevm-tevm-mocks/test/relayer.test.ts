import { relayer } from "@fhevm/mock-utils";
import { ethers } from "ethers";

import {
  createFhevmRelayerHandlers,
  createFhevmTevmProvider,
  FhevmHandle,
  MockFhevmInstance,
  type CreateFhevmRelayerHandlersOptions,
  type Eip1193Provider,
} from "../src/index.js";

const handle = `0x${"11".repeat(32)}`;
const staticBaseProvider = (): Eip1193Provider => ({
  async request() {
    return "0x0";
  },
});

const address = "0x0000000000000000000000000000000000000001";

const createOptions = (provider: Eip1193Provider): CreateFhevmRelayerHandlersOptions => ({
  provider,
  chainId: 900,
  gatewayChainId: 901,
  addresses: {
    ACLAddress: address,
    CoprocessorAddress: "0x0000000000000000000000000000000000000002",
    GatewayDecryptionAddress: "0x0000000000000000000000000000000000000003",
    InputVerifierAddress: "0x0000000000000000000000000000000000000004",
    KMSVerifierAddress: "0x0000000000000000000000000000000000000005",
    RelayerSignerAddress: "0x0000000000000000000000000000000000000006",
  },
  coprocessor: {
    async queryHandlesBytes32AsHex() {
      return [];
    },
    async computeCoprocessorSignatures() {
      return { handles: [], signatures: [] };
    },
    async insertHandleBytes32() {},
    async handleEvmRevert() {},
  },
  contracts: {
    kmsVerifier: {
      async computeDecryptionSignatures() {
        return { abiEncodedClearResult: "0x", signatures: [] };
      },
    },
  },
});

describe("createFhevmRelayerHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves Zama relayer metadata from the configured Tevm runtime", async () => {
    const baseProvider: Eip1193Provider = {
      async request() {
        return "0x0";
      },
    };
    const provider = createFhevmTevmProvider(
      baseProvider,
      createFhevmRelayerHandlers(createOptions(baseProvider)),
    );

    await expect(provider.send(relayer.RELAYER_METADATA, [])).resolves.toMatchObject({
      chainId: 900,
      gatewayChainId: 901,
      ACLAddress: address,
    });
  });

  it("lets the coprocessor observe Tevm reverts without replacing evm_revert", async () => {
    const calls: string[] = [];
    const baseProvider: Eip1193Provider = {
      async request(args) {
        calls.push(args.method);
        return args.method === "eth_blockNumber" ? "0x2a" : true;
      },
    };
    const options = createOptions(baseProvider);
    let revertedAt: number | undefined;
    options.coprocessor.handleEvmRevert = async (blockNumber) => {
      revertedAt = blockNumber;
    };
    const provider = createFhevmTevmProvider(baseProvider, createFhevmRelayerHandlers(options));

    await expect(provider.send("evm_revert", ["0x1"])).resolves.toBe(true);
    expect(calls).toEqual(["evm_revert", "eth_blockNumber"]);
    expect(revertedAt).toBe(42);
  });

  it("returns KMS decryption signatures for a valid create-signatures payload", async () => {
    const baseProvider = staticBaseProvider();
    const options = createOptions(baseProvider);
    options.contracts.kmsVerifier.computeDecryptionSignatures = async () => ({
      abiEncodedClearResult: "0x2a",
      signatures: ["0xdeadbeef"],
    });
    const provider = createFhevmTevmProvider(baseProvider, createFhevmRelayerHandlers(options));

    await expect(
      provider.send(relayer.FHEVM_CREATE_DECRYPTION_SIGNATURES, [
        { handlesBytes32Hex: [handle], clearTextValuesHex: ["0x2a"], extraData: "0x" },
      ]),
    ).resolves.toEqual(["0xdeadbeef"]);
  });

  it("rejects a create-signatures payload missing clearTextValuesHex", async () => {
    const baseProvider = staticBaseProvider();
    const provider = createFhevmTevmProvider(
      baseProvider,
      createFhevmRelayerHandlers(createOptions(baseProvider)),
    );

    await expect(
      provider.send(relayer.FHEVM_CREATE_DECRYPTION_SIGNATURES, [
        { handlesBytes32Hex: [handle], extraData: "0x" },
      ]),
    ).rejects.toThrow(/clearTextValuesHex/);
  });

  it("rejects a public-decrypt call that does not pass exactly one param", async () => {
    const baseProvider = staticBaseProvider();
    const provider = createFhevmTevmProvider(
      baseProvider,
      createFhevmRelayerHandlers(createOptions(baseProvider)),
    );

    await expect(provider.send(relayer.RELAYER_V1_PUBLIC_DECRYPT, [])).rejects.toThrow(/exactly one param/);
  });

  it("maps user-decrypt handles to clear texts after verifying ACL and signature", async () => {
    const aclSpy = vi.spyOn(MockFhevmInstance, "verifyUserACLPermissions").mockResolvedValue([]);
    const signatureSpy = vi
      .spyOn(MockFhevmInstance, "verifyUserDecryptSignature")
      .mockResolvedValue(undefined);
    const baseProvider = staticBaseProvider();
    const options = createOptions(baseProvider);
    options.coprocessor.queryHandlesBytes32AsHex = async () => ["0x2a"];
    const provider = createFhevmTevmProvider(baseProvider, createFhevmRelayerHandlers(options));

    const response = await provider.send(relayer.RELAYER_V1_USER_DECRYPT, [
      {
        handleContractPairs: [{ handle, contractAddress: address }],
        requestValidity: { startTimestamp: "0", durationDays: "1" },
        contractsChainId: "900",
        contractAddresses: [address],
        userAddress: "0x00000000000000000000000000000000000000aa",
        signature: "0x",
        publicKey: "0x",
        extraData: "0x",
      },
    ]);

    expect(response).toEqual({ payload: { decrypted_values: ["0x2a"] }, signature: ethers.ZeroHash });
    expect(aclSpy).toHaveBeenCalledOnce();
    expect(signatureSpy).toHaveBeenCalledOnce();
  });

  it("maps delegated user-decrypt handles after verifying the delegation chain", async () => {
    const aclSpy = vi.spyOn(MockFhevmInstance, "verifyUserACLPermissions").mockResolvedValue([]);
    const signatureSpy = vi
      .spyOn(MockFhevmInstance, "verifyDelegatedUserDecryptSignature")
      .mockResolvedValue(undefined);
    const delegationSpy = vi.spyOn(MockFhevmInstance, "verifyUserDecryptionDelegation").mockResolvedValue([]);
    const baseProvider = staticBaseProvider();
    const options = createOptions(baseProvider);
    options.coprocessor.queryHandlesBytes32AsHex = async () => ["0x2a"];
    const provider = createFhevmTevmProvider(baseProvider, createFhevmRelayerHandlers(options));

    const response = await provider.send(relayer.RELAYER_V1_DELEGATED_USER_DECRYPT, [
      {
        handleContractPairs: [{ handle, contractAddress: address }],
        requestValidity: { startTimestamp: "0", durationDays: "1" },
        contractsChainId: "900",
        contractAddresses: [address],
        delegatorAddress: "0x00000000000000000000000000000000000000bb",
        delegateAddress: "0x00000000000000000000000000000000000000cc",
        signature: "0x",
        publicKey: "0x",
        extraData: "0x",
      },
    ]);

    expect(response).toEqual({ payload: { decrypted_values: ["0x2a"] }, signature: ethers.ZeroHash });
    expect(aclSpy).toHaveBeenCalledOnce();
    expect(signatureSpy).toHaveBeenCalledOnce();
    expect(delegationSpy).toHaveBeenCalledOnce();
  });

  it("inserts every computed input-proof handle in payload order", async () => {
    const insertSpy = vi.fn(
      async (_handle: string, _clearText: string, _metadata: unknown): Promise<void> => {},
    );
    vi.spyOn(FhevmHandle, "computeHandles").mockReturnValue([]);
    const firstHandle = `0x${"aa".repeat(32)}`;
    const secondHandle = `0x${"bb".repeat(32)}`;
    const firstMetadata = { note: "first" };
    const secondMetadata = { note: "second" };
    const baseProvider = staticBaseProvider();
    const options = createOptions(baseProvider);
    options.coprocessor.insertHandleBytes32 = insertSpy;
    options.coprocessor.computeCoprocessorSignatures = async () => ({
      handles: [firstHandle, secondHandle],
      signatures: [],
    });
    const provider = createFhevmTevmProvider(baseProvider, createFhevmRelayerHandlers(options));

    await provider.send(relayer.RELAYER_V1_INPUT_PROOF, [
      {
        contractAddress: address,
        userAddress: "0x00000000000000000000000000000000000000aa",
        ciphertextWithInputVerification: "0x00",
        contractChainId: "900",
        extraData: "0x",
        mockData: {
          aclContractAddress: address,
          clearTextValuesBigIntHex: ["0x07", "0x23"],
          metadatas: [firstMetadata, secondMetadata],
          fheTypes: [],
          fhevmTypes: [],
          random32List: [],
        },
      },
    ]);

    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(insertSpy).toHaveBeenNthCalledWith(1, firstHandle, "0x07", firstMetadata);
    expect(insertSpy).toHaveBeenNthCalledWith(2, secondHandle, "0x23", secondMetadata);
  });
});
