---
"deployoor": minor
---

Harden `redeploymentStrategy` and make the pinned verification sources content-addressed.

- **A v1 record no longer redeploys on a comment-only recompile.** The v1 fallback compared raw creation bytecode, which carries the same trailing CBOR metadata hash as the runtime code — so upgrading deployoor and recompiling redeployed every existing contract on the first run under the new `'on-change'` default. Both sides are now metadata-stripped.
- **Constructor args are compared by their ABI encoding**, not their JSON shape, so `1`, `1n`, and the `"1"` a record stores are one value and addresses match in either casing. This is the canonicalisation `identityHash` already applied to the whole tuple, so the component diff and the hash now agree by construction.
- **`stripMetadata` is total.** It parsed the trailing bytes as a length without checking they were hex, so bytecode ending in an unlinked `__$…$__` library placeholder threw — surfacing as an untagged defect from the diff path, which documents itself as non-throwing.
- **Pinned verification sources are content-addressed**, at `deployments/sources/<hash>.json` with a `sourcesHash` on the record, replacing the per-record `<Name>.sources.json` sidecar. A standard-json input is the whole compilation unit, so the previous layout meant one copy of every source file per contract _per chain_; identical input is now stored once. `reset` collects blobs no remaining record references instead of deleting by name, so a blob another chain still points at survives. `StoreAdapter.writeSources`/`readSources` are keyed by hash and `removeSources` is replaced by `pruneSources`.
- **Records store a `codeHash`, not a second copy of the runtime bytecode.** Verification never reads it — a standard-json verify submits the pinned sources and the explorer recompiles — so the field's only real job is the offline check "is the code at this address still what I recorded?", which a 32-byte digest answers as well as ~24KB of hex per contract per chain. It is omitted (rather than silently meaning something else) when the runtime bytecode still carries unlinked library placeholders, because viem's `keccak256` does not reject non-hex input — it falls through to hashing the text.
- **`identityHash` is omitted rather than substituted** when the identity is not computable. It previously fell back to a bare code hash, which can never equal a real identity hash and so bought exactly one spurious redeploy; absent, the reuse test falls back to the component diff.
- **`register` appends to history instead of replacing it.** Re-registering an external contract at a new address kept only the new entry and recorded no `supersededAddress`. Re-registering the _same_ address appends nothing, so a repeated script run no longer grows the log.

Upgrading: existing `deployments/**/<Name>.sources.json` files are no longer read or written and can be deleted; the next deploy pins its sources under `deployments/sources/`.
