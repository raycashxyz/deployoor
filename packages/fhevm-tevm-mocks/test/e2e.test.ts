import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, defineDeployer, memoryStore, type TypedArtifact } from "deployoor";
import { createMemoryClient } from "tevm";
import { bytesToHex, type Abi, type Account, type Hex } from "viem";

import { createFhevmTevmRuntime, relayer } from "../src/index.js";

const require = createRequire(import.meta.url);
const solc = require("solc") as {
  compile: (
    input: string,
    options?: { import?: (specifier: string) => { contents: string } | { error: string } },
  ) => string;
};

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const sourceName = "test/fixtures/FheCounter.sol";
const sourcePath = join(packageRoot, sourceName);
const fheSolPath = require.resolve("@fhevm/solidity/lib/FHE.sol") as string;
const fheSolDir = dirname(fheSolPath);
const fheSolRequire = createRequire(fheSolPath);

interface SolcContract {
  readonly abi: Abi;
  readonly evm: {
    readonly bytecode: {
      readonly object: string;
    };
  };
}

interface SolcOutput {
  readonly errors?: ReadonlyArray<{
    readonly formattedMessage?: string;
    readonly message?: string;
    readonly severity: "error" | "warning" | "info";
  }>;
  readonly contracts?: Record<string, Record<string, SolcContract>>;
}

// A const ABI so the deployed contract is fully typed end-to-end: `getOrDeploy` resolves to a
// DeployResult, and `result.contract` is the typed viem object (`.read.*` / `.write.*` / `.address`).
const fheCounterAbi = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "acl", type: "address" },
      { name: "coprocessor", type: "address" },
      { name: "kmsVerifier", type: "address" },
    ],
  },
  {
    type: "function",
    name: "add",
    stateMutability: "nonpayable",
    inputs: [
      { name: "encryptedValue", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "encryptedTotal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

// A structural fingerprint (ignoring internalType and ordering) used to assert `fheCounterAbi` stays a
// subset of the ABI solc actually emits. It only covers the members we call, so extra emitted entries
// (e.g. the SenderNotAllowedToUseHandle custom error) are allowed; a renamed/retyped member fails loudly.
type AbiFingerprintInput = {
  readonly type: string;
  readonly name?: string;
  readonly stateMutability?: string;
  readonly inputs?: readonly { readonly type: string }[];
  readonly outputs?: readonly { readonly type: string }[];
};

const abiFingerprint = (item: AbiFingerprintInput): string =>
  JSON.stringify({
    type: item.type,
    name: item.name,
    stateMutability: item.stateMutability,
    inputs: (item.inputs ?? []).map((param) => param.type),
    outputs: (item.outputs ?? []).map((param) => param.type),
  });

const resolveSolidityImport = (specifier: string): { contents: string } | { error: string } => {
  const candidates: string[] = [];

  if (specifier.startsWith("@fhevm/solidity/")) {
    candidates.push(require.resolve(specifier) as string);
  } else if (specifier === "encrypted-types/EncryptedTypes.sol") {
    candidates.push(fheSolRequire.resolve(specifier));
  } else if (specifier.startsWith("./")) {
    candidates.push(resolve(fheSolDir, specifier));
  }

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (resolved === undefined) {
    return { error: `Import not found: ${specifier}` };
  }
  return { contents: readFileSync(resolved, "utf8") };
};

const compileFheCounterArtifact = (): TypedArtifact<typeof fheCounterAbi> => {
  const source = readFileSync(sourcePath, "utf8");
  const standardJsonInput = {
    language: "Solidity",
    sources: {
      [sourceName]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(standardJsonInput), { import: resolveSolidityImport }),
  ) as SolcOutput;
  const errors = output.errors?.filter((error) => error.severity === "error") ?? [];
  if (errors.length > 0) {
    throw new Error(
      errors.map((error) => error.formattedMessage ?? error.message ?? "solc error").join("\n"),
    );
  }

  const contract = output.contracts?.[sourceName]?.FheCounter;
  if (contract === undefined) {
    throw new Error("solc did not emit FheCounter");
  }
  const bytecode = contract.evm.bytecode.object;
  if (bytecode.length === 0) {
    throw new Error("solc emitted empty FheCounter bytecode");
  }

  const compiledFingerprints = new Set(contract.abi.map(abiFingerprint));
  fheCounterAbi.forEach((item) => {
    if (!compiledFingerprints.has(abiFingerprint(item))) {
      throw new Error(
        `fheCounterAbi is out of sync with the compiled FheCounter ABI (missing ${abiFingerprint(item)}); update the const to match ${sourceName}`,
      );
    }
  });

  return {
    name: "FheCounter",
    abi: fheCounterAbi,
    bytecode: `0x${bytecode}`,
    metadata: {
      fullyQualifiedName: `${sourceName}:FheCounter`,
      compilerVersion: "0.8.24",
      standardJsonInput,
      libraryPlaceholders: {},
    },
  };
};

const getEncryptedHandle = (handles: readonly Uint8Array[]): Hex => {
  const handle = handles[0];
  if (handle === undefined) {
    throw new Error("encrypted input did not return a handle");
  }
  return bytesToHex(handle);
};

const accountAt = (accounts: readonly Account[], index: number): Account => {
  const account = accounts[index];
  if (account === undefined) {
    throw new Error(`missing Tevm account at index ${index}`);
  }
  return account;
};

describe("FHEVM Tevm deployoor e2e", () => {
  it("stores alice and bob encrypted inputs and lets charlie publicly decrypt their sum", async () => {
    const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
    const runtime = await createFhevmTevmRuntime(tevm);
    const alice = accountAt(runtime.accounts, 1);
    const bob = accountAt(runtime.accounts, 2);
    const charlie = accountAt(runtime.accounts, 3);

    const getOrDeployFheCounter = defineDeployer(compileFheCounterArtifact(), defineConfig({}));
    const { contract: counter } = await getOrDeployFheCounter({
      args: [
        runtime.fhevm.addresses.ACLAddress,
        runtime.fhevm.addresses.CoprocessorAddress,
        runtime.fhevm.addresses.KMSVerifierAddress,
      ],
      publicClient: runtime.publicClient,
      store: memoryStore(),
      walletClient: runtime.walletClient,
    });

    const addEncrypted = async (account: Account, value: number): Promise<void> => {
      const input = runtime.fhevm.instance.createEncryptedInput(counter.address, account.address);
      input.add32(value);
      const encrypted = await input.encrypt();

      const hash = await counter.write.add(
        [getEncryptedHandle(encrypted.handles), bytesToHex(encrypted.inputProof)],
        {
          account,
          chain: runtime.chain,
          gas: 10_000_000n,
        },
      );
      const receipt = await runtime.publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
    };

    await addEncrypted(alice, 7);
    await addEncrypted(bob, 35);

    const encryptedTotal = await counter.read.encryptedTotal();

    expect(charlie.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const decrypted = await runtime.fhevm.instance.publicDecrypt([encryptedTotal]);
    expect(decrypted.clearValues[encryptedTotal]).toBe(42n);

    // The fhevm_getClearText relayer handler resolves the same computed handle to its clear value.
    const clearTexts = await runtime.provider.send(relayer.FHEVM_GET_CLEAR_TEXT, [[encryptedTotal]]);
    if (!Array.isArray(clearTexts) || typeof clearTexts[0] !== "string") {
      throw new Error("fhevm_getClearText did not return a clear text");
    }
    expect(BigInt(clearTexts[0])).toBe(42n);
  });
});
