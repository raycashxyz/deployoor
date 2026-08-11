---
"deployoor": patch
---

Groundwork for committable `deployers/`, inert on its own.

Adds the `GeneratedArtifact<A>` type — the shape `deployoor generate` will emit once the deployers
carry only what cannot be recovered from a compiled artifact — and an abi canonicaliser that answers
"is this the same interface?" while ignoring solc key order, abi entry order and `internalType`.

Nothing emits or consumes either yet, so there is no behaviour change. The release note for the
feature lands with the change that wires them up.
