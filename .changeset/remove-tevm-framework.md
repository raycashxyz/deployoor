---
"deployoor": minor
---

Remove the `tevm` framework. deployoor no longer compiles Solidity itself: it reads the artifacts Hardhat (v2/v3) or Foundry already wrote.

- `framework: "tevm"` is gone, and so is its auto-detection — a `tevm.config.*`, or `.sol` files under `src/`/`contracts/` with no `foundry.toml` or `hardhat.config.*`, no longer counts as a project. Such a project is now reported as undetected.
- The `sources` config option (the tevm-only `.sol` directory) is removed.
- The optional `@tevm/compiler` and `solc` peer dependencies are removed.
- A config that still says `framework: "tevm"` (or any other unknown value) now fails with an `UnsupportedFramework` error that says what to do, instead of falling through to "could not tell what this project is built with".

To migrate, compile with Hardhat (`npx hardhat compile`) or Foundry (`forge build`), then drop `framework: "tevm"` and `sources` from `deployoor.config.ts` — the framework is auto-detected from `hardhat.config.*` / `foundry.toml` — and uninstall `@tevm/compiler` and `solc` if nothing else uses them.
