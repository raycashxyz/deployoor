---
"@deployoor/hardhat": minor
---

Add Hardhat 3 support via a new `@deployoor/hardhat/v3` entry point.

Hardhat 3 replaced Hardhat 2's side-effect plugin registration with a declarative, ESM-only
model, so the two majors need different wiring. This package now ships both from one install:

- `@deployoor/hardhat` (default) — Hardhat 2, registered by `import "@deployoor/hardhat"` (unchanged).
- `@deployoor/hardhat/v3` — Hardhat 3, a plugin object you add to `plugins: []`. It overrides the
  `compile` task to run `deployoor generate` afterward (via a lazily-imported action, as Hardhat 3
  requires for plugins). Disable it by removing it from `plugins`.

Both reuse the same `generateDeployers` and the shared "never break compile" behavior. The peer
range widens to `hardhat@^2 || ^3`.
