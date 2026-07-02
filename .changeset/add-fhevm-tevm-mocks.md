---
"fhevm-tevm-mocks": minor
---

Add `fhevm-tevm-mocks`: Tevm-native adapter primitives for running Zama FHEVM mock tests in an in-memory EVM. You own the Tevm instance and pass it in; `createFhevmTevmRuntime(tevm)` installs the Zama host contracts, initializes ACL/KMSVerifier/InputVerifier storage, wires the mock relayer RPC handlers, and returns viem wallet/public clients plus a `MockFhevmInstance` for SDK-style encryption and decryption. `tevm` and `viem` are peer dependencies. The package is deploy-framework-agnostic — deploy your contracts with viem, Hardhat, Foundry, or any tool.
