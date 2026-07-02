# fhevm-tevm-mocks

Tevm-native adapter primitives for running Zama FHEVM mock tests in an in-memory EVM.

**Requires Node ≥ 20.** tevm's CJS build depends on ESM-only packages that break under `require()` on Node 18; the ESM import path works on Node 18, but CJS consumers need Node ≥ 20.19.

This is an independent, unscoped package named `fhevm-tevm-mocks`. It builds on top of
`@fhevm/mock-utils`; it does not create or emulate a Hardhat Runtime Environment.

## Core Rule

You own the Tevm instance. Pass it in.

`fhevm-tevm-mocks` never creates a Tevm `MemoryClient` for you. That keeps it usable inside an existing test
environment where Tevm state, accounts, chain config, snapshots, and other test helpers are already owned by the
caller.

Because you construct the Tevm instance, install `fhevm-tevm-mocks` and `viem` — tevm is pinned by this package so you never fight a version mismatch. You still pass your own Tevm `MemoryClient` into the adapter so test state stays under your control.

```ts
import { createMemoryClient } from "tevm";
import { createFhevmTevmRuntime } from "fhevm-tevm-mocks";

const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
const runtime = await createFhevmTevmRuntime(tevm);

console.assert(runtime.tevm === tevm);
```

There is intentionally no `createFhevmTevmMockRuntime()` or package-created Tevm shortcut.

## What Setup Does

`createFhevmTevmRuntime(tevm)` wraps and mutates the Tevm instance you pass in:

1. Waits for `tevm.tevmReady()`.
2. Wraps the existing Tevm EIP-1193 provider with an FHEVM-aware provider.
3. Creates viem `publicClient` and `walletClient` against that wrapped provider.
4. Installs Zama host contract runtime bytecode into the same Tevm state.
5. Initializes ACL, KMSVerifier, and InputVerifier storage.
6. Creates `FhevmContractsRepository`, `FhevmDBMap`, `MockCoprocessor`, and `MockFhevmInstance` from
   `@fhevm/mock-utils`.
7. Registers FHEVM mock relayer RPC handlers on the wrapped provider.

If you want separate steps, use:

```ts
import { createFhevmTevmClients, setupFhevmTevmRuntime } from "fhevm-tevm-mocks";

const clients = await createFhevmTevmClients(tevm);
const runtime = await setupFhevmTevmRuntime(clients);
```

Both forms use the same caller-owned Tevm instance.

## Full E2E Example

This example uses only Tevm, viem, and `fhevm-tevm-mocks` — no deploy framework. Deploy your contract
however you already do (viem's `deployContract`, Hardhat, Foundry, …); here we deploy with viem directly.

- Tevm for the in-memory EVM.
- `fhevm-tevm-mocks` to install the Zama mock host contracts and relayer handlers.
- viem's `deployContract` + `getContract` for the contract itself, using an `abi`/`bytecode` from your compiler.
- `runtime.fhevm.instance`, which is the `MockFhevmInstance` from `@fhevm/mock-utils`, for encryption and public
  decrypt.

### Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {CoprocessorConfig} from "@fhevm/solidity/lib/Impl.sol";

contract FheCounter {
    euint32 private total;

    constructor(address acl, address coprocessor, address kmsVerifier) {
        FHE.setCoprocessor(
            CoprocessorConfig({ACLAddress: acl, CoprocessorAddress: coprocessor, KMSVerifierAddress: kmsVerifier})
        );
    }

    function add(externalEuint32 encryptedValue, bytes calldata inputProof) external {
        euint32 value = FHE.fromExternal(encryptedValue, inputProof);

        total = FHE.add(total, value);
        FHE.allowThis(total);
        FHE.makePubliclyDecryptable(total);
    }

    function encryptedTotal() external view returns (euint32) {
        return total;
    }
}
```

The constructor is important. FHEVM Solidity stores the coprocessor config in the consuming contract's storage, so
the test contract must call `FHE.setCoprocessor(...)` with the host addresses installed by the runtime.

### Test

`fhevm-tevm-mocks` never deploys contracts for you — bring the compiled `abi` + `bytecode` from your own
toolchain (Hardhat `artifacts/`, Foundry `out/`, or `solc`) and deploy with viem. The FHEVM host addresses
the constructor needs come from `runtime.fhevm.addresses`.

```ts
import { createMemoryClient } from "tevm";
import { bytesToHex, getContract } from "viem";
import { createFhevmTevmRuntime } from "fhevm-tevm-mocks";
import { abi, bytecode } from "./FheCounter.artifact"; // your compiler output

const tevm = createMemoryClient({ miningConfig: { type: "auto" } });
const runtime = await createFhevmTevmRuntime(tevm);

const hash = await runtime.walletClient.deployContract({
  abi,
  bytecode,
  account: runtime.account,
  chain: runtime.chain,
  args: [
    runtime.fhevm.addresses.ACLAddress,
    runtime.fhevm.addresses.CoprocessorAddress,
    runtime.fhevm.addresses.KMSVerifierAddress,
  ],
});
const { contractAddress } = await runtime.publicClient.waitForTransactionReceipt({ hash });
if (contractAddress === null) throw new Error("deploy did not return a contract address");

const counter = getContract({
  address: contractAddress,
  abi,
  client: { public: runtime.publicClient, wallet: runtime.walletClient },
});

const alice = runtime.accounts[1];
const bob = runtime.accounts[2];
const charlie = runtime.accounts[3];

const addEncrypted = async (account: typeof alice, value: number) => {
  const input = runtime.fhevm.instance.createEncryptedInput(counter.address, account.address);
  input.add32(value);
  const encrypted = await input.encrypt();

  const handle = bytesToHex(encrypted.handles[0]!);
  const inputProof = bytesToHex(encrypted.inputProof);

  const hash = await counter.write.add([handle, inputProof], {
    account,
    chain: runtime.chain,
    gas: 10_000_000n,
  });
  const receipt = await runtime.publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
};

await addEncrypted(alice, 7);
await addEncrypted(bob, 35);

const encryptedTotal = await counter.read.encryptedTotal();

// Public decrypt is public: Charlie does not need prior ACL permission.
console.assert(charlie.address !== undefined);
const decrypted = await runtime.fhevm.instance.publicDecrypt([encryptedTotal]);
expect(decrypted.clearValues[encryptedTotal]).toBe(42n);
```

The high gas limit is intentional in this example. FHEVM host calls are much heavier than ordinary test-contract
updates, and Tevm's default gas selection can under-shoot for this path.

## Runtime Shape

`createFhevmTevmRuntime(tevm)` returns the wrapped clients plus `fhevm`:

```ts
runtime.tevm; // the exact MemoryClient you passed in
runtime.provider; // FHEVM-aware EIP-1193 provider
runtime.publicClient; // viem public client using runtime.provider
runtime.walletClient; // viem wallet client using runtime.provider
runtime.walletClientFor(account); // viem wallet client for another Tevm account
runtime.accounts; // Tevm prefunded accounts unless you pass your own

runtime.fhevm.addresses; // resolved host addresses
runtime.fhevm.contracts; // @fhevm/mock-utils FhevmContractsRepository
runtime.fhevm.coprocessor; // @fhevm/mock-utils MockCoprocessor
runtime.fhevm.db; // @fhevm/mock-utils FhevmDBMap
runtime.fhevm.instance; // @fhevm/mock-utils MockFhevmInstance
```

Use `runtime.fhevm.instance` for the SDK-style test operations:

```ts
const input = runtime.fhevm.instance.createEncryptedInput(contractAddress, userAddress);
const decrypted = await runtime.fhevm.instance.publicDecrypt([handle]);
```

## Relayer RPC Methods

After setup, `runtime.provider` intercepts FHEVM mock relayer methods from `@fhevm/mock-utils`:

- `fhevm_relayer_metadata`
- `fhevm_relayer_v1_input_proof`
- `fhevm_relayer_v1_public_decrypt`
- `fhevm_relayer_v1_user_decrypt`
- `fhevm_relayer_v1_delegated_user_decrypt`
- `fhevm_getClearText`
- `fhevm_createDecryptionSignatures`

Unknown RPC methods are forwarded to the underlying Tevm provider.

## Default Host Addresses

The defaults match the local addresses compiled into `@fhevm/host-contracts@0.10.0`:

- `ACLAddress`: `0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D`
- `CoprocessorAddress`: `0xe3a9105a3a932253A70F126eb1E3b589C643dD24`
- `GatewayDecryptionAddress`: `0x5ffdaAB0373E62E2ea2944776209aEf29E631A64`
- `GatewayInputVerificationAddress`: `0x812b06e1CDCE800494b79fFE4f925A504a9A9810`
- `HCULimitAddress`: `0x233ff88A48c172d29F675403e6A8e302b0F032D9`
- `InputVerifierAddress`: `0x36772142b74871f255CbD7A3e89B401d3e45825f`
- `KMSVerifierAddress`: `0x901F8942346f7AB3a01F6D7613119Bca447Bb030`
- `RelayerSignerAddress`: `0x0000000000000000000000000000000000000000`

Custom addresses are only safe if they match the addresses compiled into the host contract bytecode. Setup validates
the hard-coded addresses exposed by `FHEVMExecutor`, `ACL`, and `HCULimit` and fails early on mismatches.

## Scope

Implemented:

- Existing Tevm instance adaptation.
- Zama host bytecode installation into Tevm.
- KMSVerifier/InputVerifier initialization.
- Relayer RPC handler wiring.
- `MockCoprocessor`, `FhevmDBMap`, `FhevmContractsRepository`, and `MockFhevmInstance` wiring.
- SDK-style encryption/decryption through `runtime.fhevm.instance`.
- End-to-end coverage (deploying with viem) for encrypted inputs, encrypted contract state, and public decrypt.

Intentionally not implemented:

- Hardhat Runtime Environment mocks.
- Package-created Tevm instances.
- Contract compilation or artifact generation. Use your own compiler and deploy tool (viem, Hardhat, Foundry, …) for that.
