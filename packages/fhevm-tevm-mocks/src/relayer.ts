import { constants, FhevmHandle, MockFhevmInstance, relayer, utils, version } from "@fhevm/mock-utils";
import { ethers } from "ethers";
import type { Address } from "viem";

import { assertFhevmTevm } from "./errors.js";
import type {
  Eip1193Provider,
  Eip1193RequestArguments,
  FhevmRpcHandler,
  FhevmRpcHandlers,
} from "./provider.js";

export interface FhevmTevmRelayerAddresses {
  readonly ACLAddress: Address;
  readonly CoprocessorAddress: Address;
  readonly GatewayDecryptionAddress: Address;
  readonly InputVerifierAddress: Address;
  readonly KMSVerifierAddress: Address;
  readonly RelayerSignerAddress: Address;
}

export interface FhevmTevmCoprocessor {
  queryHandlesBytes32AsHex(handlesBytes32Hex: readonly string[]): Promise<string[]>;
  computeCoprocessorSignatures(
    handlesBytes32: readonly Uint8Array[],
    contractChainId: number,
    contractAddress: string,
    userAddress: string,
    extraData: string,
  ): Promise<relayer.RelayerV1InputProofResponse>;
  insertHandleBytes32(
    handleBytes32Hex: string,
    clearTextValueBigIntHex: string,
    metadata: unknown,
  ): Promise<void>;
  handleEvmRevert?(blockNumber: number): Promise<void>;
}

export interface FhevmTevmKmsVerifier {
  computeDecryptionSignatures(
    handlesBytes32Hex: readonly string[],
    clearTextValues: readonly (string | bigint | boolean)[],
    extraData: string,
  ): Promise<{
    readonly abiEncodedClearResult: string;
    readonly decryptionProof?: string;
    readonly signatures: string[];
  }>;
}

export interface FhevmTevmContractsRepository {
  readonly kmsVerifier: FhevmTevmKmsVerifier;
}

export interface CreateFhevmRelayerHandlersOptions {
  readonly addresses: FhevmTevmRelayerAddresses;
  readonly chainId: number;
  readonly contracts: FhevmTevmContractsRepository;
  readonly coprocessor: FhevmTevmCoprocessor;
  readonly enabled?: boolean;
  readonly gatewayChainId: number;
  readonly provider: Eip1193Provider;
}

export const createFhevmRelayerHandlers = (options: CreateFhevmRelayerHandlersOptions): FhevmRpcHandlers => {
  const enabled = options.enabled ?? true;
  const ethersProvider = new ethers.BrowserProvider(options.provider as ethers.Eip1193Provider);

  const withEmbeddedEngine =
    (handler: (args: Eip1193RequestArguments) => Promise<unknown>): FhevmRpcHandler =>
    async (args, context) => {
      if (!enabled) {
        return await context.baseProvider.request(args);
      }
      return await handler(args);
    };

  return {
    evm_revert: async (args, context) => {
      const result = await context.baseProvider.request(args);
      if (enabled && options.coprocessor.handleEvmRevert !== undefined) {
        const blockNumberHex = await context.baseProvider.request({ method: "eth_blockNumber", params: [] });
        assertFhevmTevm(
          typeof blockNumberHex === "string",
          "Expected eth_blockNumber to return a hex string",
        );
        await options.coprocessor.handleEvmRevert(Number.parseInt(blockNumberHex, 16));
      }
      return result;
    },
    [relayer.RELAYER_METADATA]: withEmbeddedEngine(async () => relayerMetadata(options)),
    [relayer.RELAYER_V1_PUBLIC_DECRYPT]: withEmbeddedEngine(async (args) =>
      handlePublicDecrypt(options, ethersProvider, args),
    ),
    [relayer.RELAYER_V1_USER_DECRYPT]: withEmbeddedEngine(async (args) =>
      handleUserDecrypt(options, ethersProvider, args),
    ),
    [relayer.RELAYER_V1_DELEGATED_USER_DECRYPT]: withEmbeddedEngine(async (args) =>
      handleDelegatedUserDecrypt(options, ethersProvider, args),
    ),
    [relayer.RELAYER_V1_INPUT_PROOF]: withEmbeddedEngine(async (args) => handleInputProof(options, args)),
    [relayer.FHEVM_GET_CLEAR_TEXT]: withEmbeddedEngine(async (args) => handleGetClearText(options, args)),
    [relayer.FHEVM_CREATE_DECRYPTION_SIGNATURES]: withEmbeddedEngine(async (args) =>
      handleCreateDecryptionSignatures(options, args),
    ),
  };
};

const relayerMetadata = (options: CreateFhevmRelayerHandlersOptions): relayer.RelayerMetadata => ({
  version,
  chainId: options.chainId,
  gatewayChainId: options.gatewayChainId,
  ACLAddress: options.addresses.ACLAddress,
  CoprocessorAddress: options.addresses.CoprocessorAddress,
  KMSVerifierAddress: options.addresses.KMSVerifierAddress,
  InputVerifierAddress: options.addresses.InputVerifierAddress,
  relayerSignerAddress: options.addresses.RelayerSignerAddress,
});

const handlePublicDecrypt = async (
  options: CreateFhevmRelayerHandlersOptions,
  provider: ethers.BrowserProvider,
  args: Eip1193RequestArguments,
): Promise<relayer.RelayerV1PublicDecryptResponse> => {
  const payload = getSingleParam(args);
  relayer.assertIsRelayerV1PublicDecryptPayload(payload);

  await MockFhevmInstance.verifyPublicACLPermissions(
    provider,
    options.addresses.ACLAddress,
    payload.ciphertextHandles,
  );

  const clearTextHexList = await options.coprocessor.queryHandlesBytes32AsHex(payload.ciphertextHandles);
  const decryptionSignatures = await options.contracts.kmsVerifier.computeDecryptionSignatures(
    payload.ciphertextHandles,
    clearTextHexList,
    payload.extraData,
  );

  return {
    decrypted_value: decryptionSignatures.abiEncodedClearResult,
    signatures: decryptionSignatures.signatures,
  };
};

const handleUserDecrypt = async (
  options: CreateFhevmRelayerHandlersOptions,
  provider: ethers.BrowserProvider,
  args: Eip1193RequestArguments,
): Promise<relayer.RelayerV1UserDecryptResponse> => {
  const payload = getSingleParam(args);
  relayer.assertIsRelayerV1UserDecryptPayload(payload);

  await MockFhevmInstance.verifyUserACLPermissions(
    provider,
    options.addresses.ACLAddress,
    payload.handleContractPairs,
    payload.userAddress,
  );
  await MockFhevmInstance.verifyUserDecryptSignature(
    payload.publicKey,
    payload.signature,
    payload.contractAddresses,
    payload.userAddress,
    Number(payload.requestValidity.startTimestamp),
    Number(payload.requestValidity.durationDays),
    options.addresses.GatewayDecryptionAddress,
    Number(payload.contractsChainId),
  );

  const handleBytes32HexList = payload.handleContractPairs.map((pair) =>
    ethers.toBeHex(ethers.toBigInt(pair.handle), 32),
  );
  const clearTextHexList = await options.coprocessor.queryHandlesBytes32AsHex(handleBytes32HexList);

  return {
    payload: { decrypted_values: clearTextHexList },
    signature: ethers.ZeroHash,
  };
};

const handleDelegatedUserDecrypt = async (
  options: CreateFhevmRelayerHandlersOptions,
  provider: ethers.BrowserProvider,
  args: Eip1193RequestArguments,
): Promise<relayer.RelayerV1UserDecryptResponse> => {
  const payload = getSingleParam(args);
  relayer.assertIsRelayerV1DelegatedUserDecryptPayload(payload);

  await MockFhevmInstance.verifyUserACLPermissions(
    provider,
    options.addresses.ACLAddress,
    payload.handleContractPairs,
    payload.delegatorAddress,
  );
  await MockFhevmInstance.verifyDelegatedUserDecryptSignature({
    publicKey: payload.publicKey,
    signature: payload.signature,
    contractAddresses: payload.contractAddresses,
    delegatorAddress: payload.delegatorAddress,
    delegateAddress: payload.delegateAddress,
    startTimestamp: Number(payload.requestValidity.startTimestamp),
    durationDays: Number(payload.requestValidity.durationDays),
    verifyingContractAddressDecryption: options.addresses.GatewayDecryptionAddress,
    contractsChainId: Number(payload.contractsChainId),
  });
  await MockFhevmInstance.verifyUserDecryptionDelegation(
    provider,
    options.addresses.ACLAddress,
    payload.delegatorAddress,
    payload.delegateAddress,
    payload.handleContractPairs,
  );

  const handleBytes32HexList = payload.handleContractPairs.map((pair) =>
    ethers.toBeHex(ethers.toBigInt(pair.handle), 32),
  );
  const clearTextHexList = await options.coprocessor.queryHandlesBytes32AsHex(handleBytes32HexList);

  return {
    payload: { decrypted_values: clearTextHexList },
    signature: ethers.ZeroHash,
  };
};

const handleGetClearText = async (
  options: CreateFhevmRelayerHandlersOptions,
  args: Eip1193RequestArguments,
): Promise<string[]> => {
  const payload = getSingleStringArrayParam(args);
  const handleBytes32HexList = payload.map((handle) => {
    const handleBytes32Hex = utils.ensurePrefix(handle, "0x");
    FhevmHandle.verify(handleBytes32Hex, { chainId: options.chainId });
    return handleBytes32Hex;
  });

  return await options.coprocessor.queryHandlesBytes32AsHex(handleBytes32HexList);
};

const handleInputProof = async (
  options: CreateFhevmRelayerHandlersOptions,
  args: Eip1193RequestArguments,
): Promise<relayer.RelayerV1InputProofResponse> => {
  const payload = getSingleParam(args);
  relayer.assertIsMockRelayerV1InputProofPayload(payload);

  const contractChainId = utils.toUIntNumber(
    payload.contractChainId,
    "MockRelayerV1InputProofPayload.contractChainId",
  );
  assertFhevmTevm(
    options.addresses.ACLAddress === payload.mockData.aclContractAddress,
    `ACL address mismatch. Expecting ${options.addresses.ACLAddress}, got ${payload.mockData.aclContractAddress} instead.`,
  );

  const handlesBytes32List = FhevmHandle.computeHandles(
    ethers.getBytes(payload.ciphertextWithInputVerification),
    payload.mockData.fhevmTypes,
    payload.mockData.aclContractAddress,
    contractChainId,
    constants.FHEVM_HANDLE_VERSION,
  );

  const response = await options.coprocessor.computeCoprocessorSignatures(
    handlesBytes32List,
    contractChainId,
    payload.contractAddress,
    payload.userAddress,
    payload.extraData,
  );

  await response.handles.reduce(
    async (previous: Promise<void>, handle: string, index: number): Promise<void> => {
      await previous;
      const clearTextValue = payload.mockData.clearTextValuesBigIntHex[index];
      assertFhevmTevm(
        clearTextValue !== undefined,
        "Missing clear text value in relayer input proof payload",
      );
      await options.coprocessor.insertHandleBytes32(
        utils.ensurePrefix(handle, "0x"),
        clearTextValue,
        payload.mockData.metadatas[index],
      );
    },
    Promise.resolve(),
  );

  return response;
};

const handleCreateDecryptionSignatures = async (
  options: CreateFhevmRelayerHandlersOptions,
  args: Eip1193RequestArguments,
): Promise<string[]> => {
  const payload = getSingleParam(args);
  assertFhevmTevm(isRecord(payload), "Expected a decryption signatures payload");
  assertStringArray(payload.handlesBytes32Hex, "handlesBytes32Hex");
  assertStringArray(payload.clearTextValuesHex, "clearTextValuesHex");
  assertFhevmTevm(typeof payload.extraData === "string", "Expected extraData to be a string");

  const result = await options.contracts.kmsVerifier.computeDecryptionSignatures(
    payload.handlesBytes32Hex,
    payload.clearTextValuesHex,
    payload.extraData,
  );
  return result.signatures;
};

const getSingleParam = (args: Eip1193RequestArguments): unknown => {
  assertFhevmTevm(args.params !== undefined, `Expected ${args.method} params`);
  assertFhevmTevm(Array.isArray(args.params), `Expected ${args.method} params to be an array`);
  assertFhevmTevm(args.params.length === 1, `Expected ${args.method} to receive exactly one param`);
  return args.params[0];
};

const getSingleStringArrayParam = (args: Eip1193RequestArguments): string[] => {
  const param = getSingleParam(args);
  assertStringArray(param, "params[0]");
  return param;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  assertFhevmTevm(Array.isArray(value), `Expected ${label} to be an array`);
  value.forEach((item) => {
    assertFhevmTevm(typeof item === "string", `Expected ${label} to contain only strings`);
  });
}
