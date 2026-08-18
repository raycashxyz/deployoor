---
"@deployoor/testing": minor
---

Replace tevm with EDR as the in-memory EVM. `createTestClients()` keeps its zero-config shape and generated deployers work unchanged, but the engine underneath is now [EDR](https://github.com/NomicFoundation/edr), the Rust EVM behind Hardhat 3.

Why: `tevm` could not be installed. It declares its ~40 sibling `@tevm/*` packages with caret ranges that float into a newer prerelease line, so `yarn add tevm` aborts on an unpublished `@evmts/zevm` platform package, and `npm i tevm` installs a mixed tree that throws `'@tevm/errors' does not provide an export named 'NoSignerAvailableError'` on import. That was inherited by anyone installing this package. `yarn add @deployoor/testing` now works with no `resolutions` block.

The test suite also got a lot faster: deployoor's own 255-test suite went from ~7.6s to ~1.7s.

**Breaking changes:**

- `clients.tevm` is now `clients.provider`, an EIP-1193 handle. Every `hardhat_*` / `evm_*` method is reachable through `provider.request(...)`.
- `cheatcodes.dumpState()` / `loadState(state)` are now `cheatcodes.snapshot()` / `revert(id)`. `revert` consumes its id, so restoring the same point twice needs two snapshots — `createFixture` handles this for you.
- `cheatcodes.deal` is removed. Its ERC20 path required guessing which storage slot holds the balance mapping, which breaks on proxies, packed slots and rebasing tokens. Use `setBalance` for native ETH; mint or transfer for tokens, or reach for `hardhat_setStorageAt` through `provider` where you know your token's layout.
- Options are no longer a tevm passthrough: `{ fork: { url, blockNumber, cacheDir }, chainId, blockGasLimit, autoMine }`. `fork` takes a URL string, not a viem transport.
- The in-memory chain is named `edr-devnet` instead of `tevm-devnet`, which changes the key of seeded in-memory records.
- **Requires Node ≥ 22**, which is what EDR declares.
