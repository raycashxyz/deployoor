---
"deployoor": minor
---

New command: `deployoor verify` — verify already-deployed contracts on a block explorer after the
fact, from committed data alone. Plus a new plugin hook, `onVerify`, which is what it calls.

```bash
npx deployoor verify
npx deployoor verify --network sepolia
npx deployoor verify --contract Counter --plugin etherscan
```

Nothing is recompiled and no artifact directory is read. A deployment record already carries the
chain id, the address, the constructor args and the linked libraries; the sources it pins
(`sourcesHash` → `deployments/sources/<hash>.json`) carry the fully-qualified contract name, the
compiler version and the standard-json input. Together that is the whole verification payload — which
is what the pinned sidecar was written for, and until now nothing read it.

**`onVerify` is a new hook on `DeployPlugin`**, and `deployoor verify` calls only that:

```ts
readonly onVerify?: (ctx: VerifyContext, deps: PluginDeps) => Awaitable<void>;

interface VerifyContext {
  readonly deployment: DeploymentRecord;
  readonly metadata: ContractMetadata;
}
```

`VerifyContext` is deliberately not a `DeployedContext`, and deliberately small. Nothing was deployed,
so there is no `receipt` and no meaningful `reused`; `metadata` is **required** rather than optional,
because a record whose sources were never pinned is reported unverifiable and never reaches a plugin;
and there is no `options`, because a plugin instance already closes over its own configuration. A
verifier written against it needs no undefined-checks and cannot mistake a verify run for a deploy.

**Breaking for third-party verifier plugins:** a plugin that only implements `onContractDeployed`
will not be called by `deployoor verify` — it is skipped, silently, and if no configured plugin
implements `onVerify` the command fails and names the plugins you do have. Implement `onVerify` over
the same body as `onContractDeployed` (see the plugins guide) and it works both at deploy time and
after the fact. Deploy-time behaviour is untouched: `onContractDeployed` and `onDeployFailed` are
called exactly as before, and this is also what stops a notifier like `@deployoor/slack` from firing
on a verify run.

Filters: `--network` matches the network key, its chain id, or its slug; `--contract` matches a
deployment name or a contract name; `--plugin` narrows to one verifier when several are configured.
All optional.

The exit code is non-zero when any selected record failed verification or could not be verified at
all, so this works as a CI check. Per-record outcomes are reported and the run continues:

```text
deployoor: checked 3 record(s) through etherscan
  verified      11155111-sepolia/Counter at 0x5FbDB…0aa3 (etherscan)
  unverifiable  1-ethereum/OldToken at 0x6B175…1d0F
                  no sourcesHash — this record's verification sources were never pinned …
  skipped       1-ethereum/USDC at 0xA0b86…eB48
                  registered external contract — deployoor did not deploy it …
deployoor: 1 verified, 1 unverifiable, 1 skipped
```

A record with **no** `sourcesHash` is `unverifiable`, not a crash: the fully-qualified name exists
only in the sidecar, so there is no route back to it without recompiling. That covers records written
before sources were pinned, and records written by a store that pins none. Externally `register`ed
contracts are `skipped` — you did not deploy them, so there is nothing to submit — and do not fail
the run.

`StoreAdapter` gains an optional `listAll()` (implemented by `fsStore` and `memoryStore`), because
`list` is per-network and a repo-wide walk needs the whole set. A store that omits it can still be
verified one `--network` at a time.

Three edge cases in the command that the first round missed:

- `--network=` (and `--contract=` / `--plugin=`) with nothing after the equals sign parsed to an empty string, which is not `undefined`, so it became an active filter matching no record — reported as "no deployment records matching", as though the repo held none. It is now the same "needs a value" error as a trailing `--network`.
- `runVerify({ plugins: [] })` selected no plugin rather than every plugin, so each record ran zero hooks, collected zero failures, and was reported **verified** with `ok: true` — a CI check passing without verifying anything. An empty list is now rejected. The CLI never produced one; the exported API could.
- `store.listAll` and `store.readSources` were read into locals and called detached, so a `StoreAdapter` implemented as a class (which the docs invite) ran them with `this` unbound and crashed. They are bound to the store now.
