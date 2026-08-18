---
---

No release. Extracting the in-memory EVM into the private `@deployoor/evm` package is
internal: `createTestClients()` keeps its signature, every exported type keeps its name,
and the code is inlined into the same bundle it was already in. `@deployoor/testing`'s
pending minor from the EDR migration has not shipped yet, so this rides along in it
rather than earning a bump of its own.
