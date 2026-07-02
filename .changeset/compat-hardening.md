---
"deployoor": patch
"@deployoor/testing": patch
"@deployoor/wagmi": patch
"@deployoor/hardhat": patch
"@deployoor/etherscan": patch
"@deployoor/sourcify": patch
"@deployoor/slack": patch
"fhevm-tevm-mocks": patch
---

Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.
