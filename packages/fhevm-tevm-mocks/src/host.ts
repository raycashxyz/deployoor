import { createRequire } from "node:module";

import { contracts, FhevmDBMap, MockCoprocessor, MockFhevmInstance } from "@fhevm/mock-utils";
import { ethers } from "ethers";
import { PREFUNDED_PRIVATE_KEYS } from "tevm";
import type { Address, Hex } from "viem";

import type { FhevmTevmClients } from "./client.js";
import { assertFhevmTevm } from "./errors.js";
import type { Eip1193Provider } from "./provider.js";
import { createFhevmRelayerHandlers, type FhevmTevmRelayerAddresses } from "./relayer.js";
import { setAccountCode, setInitializableStorage, setOwnableStorage, type TevmStateClient } from "./state.js";

const require = createRequire(import.meta.url);

const defaultKmsSignerPrivateKey = "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";
const defaultCoprocessorSignerPrivateKey =
  "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";

export interface FhevmTevmHostAddresses extends FhevmTevmRelayerAddresses {
  readonly GatewayInputVerificationAddress: Address;
  readonly HCULimitAddress: Address;
}

export const fhevmTevmDefaultAddresses = {
  ACLAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  CoprocessorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  GatewayDecryptionAddress: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  GatewayInputVerificationAddress: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  HCULimitAddress: "0x233ff88A48c172d29F675403e6A8e302b0F032D9",
  InputVerifierAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  KMSVerifierAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  RelayerSignerAddress: "0x0000000000000000000000000000000000000000",
} as const satisfies FhevmTevmHostAddresses;

export interface HostContractArtifact {
  readonly abi: ethers.InterfaceAbi;
  readonly contractName: string;
  readonly deployedBytecode: Hex;
}

export interface SetupFhevmTevmHostContractsOptions {
  readonly addresses?: Partial<FhevmTevmHostAddresses>;
  readonly adminPrivateKey?: Hex;
  readonly adminSigner?: ethers.Signer;
  readonly coprocessorSigners?: readonly ethers.Signer[];
  readonly gatewayChainId?: number;
  readonly inputVerifierThreshold?: number;
  readonly kmsSigners?: readonly ethers.Signer[];
  readonly kmsThreshold?: number;
  readonly relayerSignerAddress?: Address;
}

export interface FhevmTevmHostContractsSetup {
  readonly addresses: FhevmTevmHostAddresses;
  readonly adminAddress: Address;
  readonly contracts: contracts.FhevmContractsRepository;
  readonly coprocessor: MockCoprocessor;
  readonly coprocessorSigners: readonly ethers.Signer[];
  readonly db: FhevmDBMap;
  readonly gatewayChainId: number;
  readonly inputVerifierThreshold: number;
  readonly instance: MockFhevmInstance;
  readonly kmsSigners: readonly ethers.Signer[];
  readonly kmsThreshold: number;
}

type HostContractName = "ACL" | "FHEVMExecutor" | "HCULimit" | "InputVerifier" | "KMSVerifier";

const hostArtifactPaths = {
  ACL: "@fhevm/host-contracts/artifacts/contracts/ACL.sol/ACL.json",
  FHEVMExecutor: "@fhevm/host-contracts/artifacts/contracts/FHEVMExecutor.sol/FHEVMExecutor.json",
  HCULimit: "@fhevm/host-contracts/artifacts/contracts/HCULimit.sol/HCULimit.json",
  InputVerifier: "@fhevm/host-contracts/artifacts/contracts/InputVerifier.sol/InputVerifier.json",
  KMSVerifier: "@fhevm/host-contracts/artifacts/contracts/KMSVerifier.sol/KMSVerifier.json",
} as const satisfies Record<HostContractName, string>;

const loadHostArtifact = (name: HostContractName): HostContractArtifact =>
  require(hostArtifactPaths[name]) as HostContractArtifact;

export const setupFhevmTevmHostContracts = async (
  clients: Pick<FhevmTevmClients, "chain" | "provider" | "tevm">,
  options: SetupFhevmTevmHostContractsOptions = {},
): Promise<FhevmTevmHostContractsSetup> => {
  const addresses = resolveHostAddresses(options);
  const ethersProvider = new ethers.BrowserProvider(
    clients.provider as Eip1193Provider as ethers.Eip1193Provider,
  );
  const adminSigner =
    options.adminSigner ??
    new ethers.Wallet(options.adminPrivateKey ?? PREFUNDED_PRIVATE_KEYS[0], ethersProvider);
  const adminAddress = (await adminSigner.getAddress()) as Address;
  const kmsSigners = [...(options.kmsSigners ?? [new ethers.Wallet(defaultKmsSignerPrivateKey)])];
  const coprocessorSigners = [
    ...(options.coprocessorSigners ?? [new ethers.Wallet(defaultCoprocessorSignerPrivateKey)]),
  ];
  const kmsThreshold = options.kmsThreshold ?? 1;
  const inputVerifierThreshold = options.inputVerifierThreshold ?? 1;
  const gatewayChainId = options.gatewayChainId ?? 10901;

  const execArtifact = loadHostArtifact("FHEVMExecutor");
  const aclArtifact = loadHostArtifact("ACL");
  const kmsArtifact = loadHostArtifact("KMSVerifier");
  const inputArtifact = loadHostArtifact("InputVerifier");
  const hcuLimitArtifact = loadHostArtifact("HCULimit");

  await setHostCode(
    clients.provider,
    clients.tevm,
    "FHEVMExecutor",
    addresses.CoprocessorAddress,
    execArtifact,
  );
  await setHostCode(clients.provider, clients.tevm, "ACL", addresses.ACLAddress, aclArtifact);
  await setHostCode(clients.provider, clients.tevm, "KMSVerifier", addresses.KMSVerifierAddress, kmsArtifact);
  await setHostCode(
    clients.provider,
    clients.tevm,
    "InputVerifier",
    addresses.InputVerifierAddress,
    inputArtifact,
  );
  await setHostCode(clients.provider, clients.tevm, "HCULimit", addresses.HCULimitAddress, hcuLimitArtifact);

  const fhevmExecutor = new ethers.Contract(addresses.CoprocessorAddress, execArtifact.abi, ethersProvider);
  assertSameAddress(
    await callContract<string>(fhevmExecutor, "getACLAddress")(),
    addresses.ACLAddress,
    "FHEVMExecutor.getACLAddress()",
  );
  assertSameAddress(
    await callContract<string>(fhevmExecutor, "getHCULimitAddress")(),
    addresses.HCULimitAddress,
    "FHEVMExecutor.getHCULimitAddress()",
  );
  assertSameAddress(
    await callContract<string>(fhevmExecutor, "getInputVerifierAddress")(),
    addresses.InputVerifierAddress,
    "FHEVMExecutor.getInputVerifierAddress()",
  );

  const acl = new ethers.Contract(addresses.ACLAddress, aclArtifact.abi, ethersProvider);
  const hcuLimit = new ethers.Contract(addresses.HCULimitAddress, hcuLimitArtifact.abi, ethersProvider);
  assertSameAddress(
    await callContract<string>(acl, "getFHEVMExecutorAddress")(),
    addresses.CoprocessorAddress,
    "ACL.getFHEVMExecutorAddress()",
  );
  assertSameAddress(
    await callContract<string>(hcuLimit, "getFHEVMExecutorAddress")(),
    addresses.CoprocessorAddress,
    "HCULimit.getFHEVMExecutorAddress()",
  );

  await setOwnableStorage(clients.tevm, addresses.ACLAddress, adminAddress);

  const kms = new ethers.Contract(addresses.KMSVerifierAddress, kmsArtifact.abi, adminSigner);
  const input = new ethers.Contract(addresses.InputVerifierAddress, inputArtifact.abi, adminSigner);

  if (!(await isVerifierInitialized(kms))) {
    await setInitializableStorage(clients.tevm, addresses.KMSVerifierAddress, {
      initialized: 1n,
      initializing: false,
    });
    const tx = await callContract<ethers.ContractTransactionResponse>(kms, "initializeFromEmptyProxy")(
      addresses.GatewayDecryptionAddress,
      gatewayChainId,
      await signerAddresses(kmsSigners),
      kmsThreshold,
      { gasLimit: 10_000_000n },
    );
    await tx.wait();
  }

  if (!(await isVerifierInitialized(input))) {
    await setInitializableStorage(clients.tevm, addresses.InputVerifierAddress, {
      initialized: 1n,
      initializing: false,
    });
    const tx = await callContract<ethers.ContractTransactionResponse>(input, "initializeFromEmptyProxy")(
      addresses.GatewayInputVerificationAddress,
      gatewayChainId,
      await signerAddresses(coprocessorSigners),
      inputVerifierThreshold,
      { gasLimit: 10_000_000n },
    );
    await tx.wait();
  }

  const repository = await contracts.FhevmContractsRepository.create(ethersProvider, {
    aclContractAddress: addresses.ACLAddress,
    aclAbi: aclArtifact.abi,
    aclProperties: {
      fhevmExecutorAddress: addresses.CoprocessorAddress,
    },
    fhevmExecutorAbi: execArtifact.abi,
    fhevmExecutorProperties: {
      aclAddress: addresses.ACLAddress,
      hcuLimitAddress: addresses.HCULimitAddress,
      inputVerifierAddress: addresses.InputVerifierAddress,
    },
    hcuLimitAbi: hcuLimitArtifact.abi,
    inputVerifierAbi: inputArtifact.abi,
    inputVerifierProperties: {
      signers: [...coprocessorSigners],
    },
    kmsContractAddress: addresses.KMSVerifierAddress,
    kmsVerifierAbi: kmsArtifact.abi,
    kmsVerifierProperties: {
      signers: [...kmsSigners],
    },
  });

  const db = new FhevmDBMap();
  await db.init(await getBlockNumber(clients.provider));

  const coprocessor = await MockCoprocessor.create(ethersProvider, {
    coprocessorContractAddress: addresses.CoprocessorAddress,
    coprocessorSigners: [...coprocessorSigners],
    inputVerifierContractAddress: addresses.InputVerifierAddress,
    db,
  });

  clients.provider.extendRpcHandlers(
    createFhevmRelayerHandlers({
      addresses,
      chainId: clients.chain.id,
      contracts: repository,
      coprocessor,
      gatewayChainId,
      provider: clients.provider,
    }),
  );

  const instance = await MockFhevmInstance.create(
    clients.provider,
    ethersProvider,
    {
      aclContractAddress: addresses.ACLAddress,
      chainId: clients.chain.id,
      gatewayChainId,
      inputVerifierContractAddress: addresses.InputVerifierAddress,
      kmsContractAddress: addresses.KMSVerifierAddress,
      verifyingContractAddressDecryption: addresses.GatewayDecryptionAddress,
      verifyingContractAddressInputVerification: addresses.GatewayInputVerificationAddress,
    },
    {
      inputVerifierProperties: { signers: [...coprocessorSigners] },
      kmsVerifierProperties: { signers: [...kmsSigners] },
    },
  );

  return {
    addresses,
    adminAddress,
    contracts: repository,
    coprocessor,
    coprocessorSigners,
    db,
    gatewayChainId,
    inputVerifierThreshold,
    instance,
    kmsSigners,
    kmsThreshold,
  };
};

const resolveHostAddresses = (options: SetupFhevmTevmHostContractsOptions): FhevmTevmHostAddresses => ({
  ...fhevmTevmDefaultAddresses,
  ...options.addresses,
  RelayerSignerAddress:
    options.relayerSignerAddress ??
    options.addresses?.RelayerSignerAddress ??
    fhevmTevmDefaultAddresses.RelayerSignerAddress,
});

const setHostCode = async (
  provider: Eip1193Provider,
  tevm: Pick<TevmStateClient, "tevmSetAccount">,
  name: HostContractName,
  address: Address,
  artifact: HostContractArtifact,
): Promise<void> => {
  const existingCode = await provider.request({
    method: "eth_getCode",
    params: [address, "latest"],
  });
  assertFhevmTevm(typeof existingCode === "string", `Expected eth_getCode result for ${name} to be a string`);
  if (existingCode === artifact.deployedBytecode) {
    return;
  }

  assertFhevmTevm(existingCode === "0x", `${name} bytecode at ${address} is not empty`);
  await setAccountCode(tevm, address, artifact.deployedBytecode);
};

const getBlockNumber = async (provider: Eip1193Provider): Promise<number> => {
  const blockNumber = await provider.request({ method: "eth_blockNumber", params: [] });
  assertFhevmTevm(typeof blockNumber === "string", "Expected eth_blockNumber to return a hex string");
  return Number(BigInt(blockNumber));
};

const isVerifierInitialized = async (contract: ethers.Contract): Promise<boolean> => {
  try {
    return BigInt(await callContract<bigint>(contract, "getThreshold")()) > 0n;
  } catch {
    return false;
  }
};

const signerAddresses = async (signers: readonly ethers.Signer[]): Promise<Address[]> =>
  (await Promise.all(signers.map(async (signer) => signer.getAddress()))) as Address[];

const callContract =
  <T>(contract: ethers.Contract, method: string): ((...args: unknown[]) => Promise<T>) =>
  (...args) =>
    (contract.getFunction(method) as (...innerArgs: unknown[]) => Promise<T>)(...args);

const assertSameAddress = (actual: string, expected: string, label: string): void => {
  assertFhevmTevm(
    ethers.getAddress(actual) === ethers.getAddress(expected),
    `${label} returned ${actual}; expected ${expected}`,
  );
};
