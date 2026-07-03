# fhevm-tevm-mocks

## 0.3.0

### Minor Changes

- 7913ff9: Point repository metadata at `raycashxyz/deployoor` after transferring the GitHub org.

## 0.2.0

### Minor Changes

- ff9c849: Add `fhevm-tevm-mocks`: Tevm-native adapter primitives for running Zama FHEVM mock tests in an in-memory EVM. You own the Tevm instance and pass it in; `createFhevmTevmRuntime(tevm)` installs the Zama host contracts, initializes ACL/KMSVerifier/InputVerifier storage, wires the mock relayer RPC handlers, and returns viem wallet/public clients plus a `MockFhevmInstance` for SDK-style encryption and decryption. `tevm` and `viem` are peer dependencies. The package is deploy-framework-agnostic — deploy your contracts with viem, Hardhat, Foundry, or any tool.

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.
