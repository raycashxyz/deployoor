# @deployoor/hardhat

## 0.1.1

### Patch Changes

- 5b411a5: Docs: include peer deps (`deployoor`, `viem`) in the `@deployoor/testing` install command, and fix the broken relative `deployoor` link in the `@deployoor/hardhat` README so it resolves on the npm package page.

## 0.1.0

### Minor Changes

- c12b352: New package `@deployoor/hardhat`: a Hardhat plugin that regenerates deployoor's typed deployers automatically after every `hardhat compile`, in process — no separate `deployoor generate` step, no extra terminal. Add `import "@deployoor/hardhat"` (or `require("@deployoor/hardhat")`) to your Hardhat config; opt out with `deployoor: { generate: false }`. A generation failure is reported but never breaks `hardhat compile`.

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.
