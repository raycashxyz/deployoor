# @deployoor/hardhat

## 0.3.0

### Minor Changes

- bff24ce: Add Hardhat 3 support via a new `@deployoor/hardhat/v3` entry point.

  Hardhat 3 replaced Hardhat 2's side-effect plugin registration with a declarative, ESM-only
  model, so the two majors need different wiring. This package now ships both from one install:

  - `@deployoor/hardhat` (default) — Hardhat 2, registered by `import "@deployoor/hardhat"` (unchanged).
  - `@deployoor/hardhat/v3` — Hardhat 3, a plugin object you add to `plugins: []`. It overrides the
    `compile` task to run `deployoor generate` afterward (via a lazily-imported action, as Hardhat 3
    requires for plugins). Disable it by removing it from `plugins`.

  Both reuse the same `generateDeployers` and the shared "never break compile" behavior. The peer
  range widens to `hardhat@^2 || ^3`.

## 0.2.0

### Minor Changes

- 7913ff9: Point repository metadata at `raycashxyz/deployoor` after transferring the GitHub org.

## 0.1.1

### Patch Changes

- 5b411a5: Docs: include peer deps (`deployoor`, `viem`) in the `@deployoor/testing` install command, and fix the broken relative `deployoor` link in the `@deployoor/hardhat` README so it resolves on the npm package page.

## 0.1.0

### Minor Changes

- c12b352: New package `@deployoor/hardhat`: a Hardhat plugin that regenerates deployoor's typed deployers automatically after every `hardhat compile`, in process — no separate `deployoor generate` step, no extra terminal. Add `import "@deployoor/hardhat"` (or `require("@deployoor/hardhat")`) to your Hardhat config; opt out with `deployoor: { generate: false }`. A generation failure is reported but never breaks `hardhat compile`.

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.
