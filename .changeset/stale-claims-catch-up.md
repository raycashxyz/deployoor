---
"@deployoor/etherscan": patch
---

Correct the README's config example and prose: `apiUrl` overrides to any Etherscan-compatible endpoint, and Blockscout/Routescan now have dedicated plugins (`@deployoor/blockscout`, `@deployoor/routescan`) that handle their per-instance and mainnet/testnet quirks rather than being pointed at through `apiUrl`.
