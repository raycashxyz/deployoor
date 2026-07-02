---
"deployoor": minor
---

Generate deployers for library-linked contracts, record the library map, and let `register` run with only a public client.

- `deployoor generate` no longer silently drops a contract whose bytecode carries solc's unlinked library placeholders (`__$…$__`). The artifact and deployment-record bytecode boundary now accepts placeholders via a new `Bytecode` validator (`Hex` stays strict for addresses and tx hashes), so a library-dependent contract gets a typed `getOrDeploy<Name>` — its addresses are linked at deploy time from the `libraries` call option, and the deployment record now also stores that `libraries` map.
- `deployoor generate` warns when an explicit `include` name matches no deployable contract (a typo, or a contract that failed to compile) instead of dropping it silently.
- `register(...)` no longer requires a `walletClient`: it only records an existing address, so a `publicClient` is enough. Pass a wallet to record it as the registrant and get a writable contract back; omit it and the deployer is recorded as the zero address (read-only contract).
