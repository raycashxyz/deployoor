---
"deployoor": minor
---

Add Hardhat 3 and tevm support to `deployoor generate`.

- **Hardhat 3**: the Hardhat reader now handles both majors, keyed on the artifact's build-info
  linkage — Hardhat 2's `<Name>.dbg.json` → build-info, and Hardhat 3's inline `buildInfoId` +
  split `build-info/<id>.json` (`hh3-sol-build-info-1`). The standard-json input and
  `solcLongVersion` used for verification are read the same way from both. Uses `inputSourceName`
  for the fully-qualified name when present so verification matches the compiled source path.
- **tevm**: a new adapter compiles a project's `.sol` sources directly with `@tevm/compiler` + a
  solc-js instance — no Hardhat or Foundry project required. A plain-`.sol` project is
  auto-detected (no Foundry/Hardhat markers + `.sol` under `src/` or `contracts/`); set
  `framework: "tevm"` in `deployoor.config.ts` (or add a `tevm.config.*`) and `sources` only to be
  explicit or when contracts live elsewhere. `@tevm/compiler` and `solc` are optional peers,
  lazy-loaded only for tevm projects, so the core stays dependency-light.

`generate` is now async internally (the tevm adapter compiles on demand); the CLI and
`generateDeployers` are unaffected. New config fields: `framework` and `sources`.
