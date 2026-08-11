---
"deployoor": minor
---

`deployers/` is now small enough to commit, and the deploy path reads the rest from your compiled
artifacts.

**What `generate` emits changed.** A generated artifact module carried the abi *and* the bytecode,
the compiler settings, and `standardJsonInput` — the whole compilation unit's source text, inlined
once per contract, which is the only reason the folder was large. It now carries what cannot be
recovered from disk:

```ts
export const counterArtifact = {
  name: "Counter",
  fullyQualifiedName: "contracts/Counter.sol:Counter",
  abi,
} satisfies GeneratedArtifact<typeof abi>;
```

The abi stays inlined `as const` because that literal type is the whole point: it types `args` and
`contract.read.*`, and a JSON import widens `"uint256"` to `string`, which abitype cannot use.
Everything else is loaded from the compiled artifact at deploy time, keyed by `fullyQualifiedName`.
So the emitted files only change when your interface does — a solc patch bump or an
implementation-only edit no longer touches them.

**Deploying now requires compiled artifacts, and says so when they are missing.** Two new fatal
errors: `ContractArtifactNotFound` names the contract and lists what *was* compiled, so a rename is
obvious; `GeneratedArtifactStale` fires when the committed abi no longer matches the artifact and
prints the difference.

```text
Counter's abi no longer matches its compiled artifact.

Re-run `deployoor generate`, then deploy again.

  + function decrement() nonpayable
  - function reset() nonpayable
```

That check is what makes a committed `deployers/` safe. Without it a stale abi would encode
constructor args against the old interface and write the old abi into the deployment record, which is
what every consumer then reads. The comparison is canonical, so solc key order, abi entry order and
`internalType` never trigger it.

**`defineDeployer` accepts either shape.** A full `TypedArtifact` is used as-is and never touches the
filesystem, so hand-built artifacts and in-memory compilation keep working unchanged — `TypedArtifact`
and `Artifact` are not modified. Artifacts are read once per project per process.
