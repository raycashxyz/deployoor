# deployoor

## 0.8.0

### Minor Changes

- 1722559: Match generated relative imports to the project's TypeScript setup, so `deployers/` typechecks under `moduleResolution: node16`/`nodenext` (Hardhat 3's default) as well as `bundler`.

  Those modes reject extensionless relative specifiers with TS2835, so a strict-ESM project could not `tsc` a deployoor project without loosening resolution. `deployoor generate` now reads the project's `tsconfig.json` (following `extends`) and emits `./types/Counter.js` only for the resolution modes that require it. This includes projects that only set `module`, since `node16`, `node18` and `node20` all imply `moduleResolution: node16`. Every other mode keeps the extensionless form, since a `.js` specifier fails to resolve where it is not mapped back to `.ts` (webpack without `resolve.extensionAlias`, ts-jest without a `moduleNameMapper`).

  Override with the new `importExtension` config option: `'auto'` (default), `'none'`, or `'js'`.

## 0.7.1

### Patch Changes

- 13f0991: Say clearly when a hardhat.config cannot be read, instead of guessing at `paths.artifacts`

  deployoor finds a Hardhat project's artifacts by importing `hardhat.config.*`. A config that registers a plugin — `require("@deployoor/hardhat")`, or any plugin a real project uses — **cannot be imported outside a Hardhat run**: it throws `HH5: HardhatContext is not created`. deployoor then falls back to the framework default.

  That is worth knowing about, because the shape hides it: `generate` succeeds while a _deploy_ fails, since the Hardhat plugin hands the resolved path over directly and only a deploy or a test has to read the config itself. Set `artifactsPath` in `deployoor.config.ts` for those projects — `examples/custom-paths` shows it, with the reasoning.

  A text fallback that read the literal `paths.artifacts` out of the source was tried and removed before release. Four rounds of review found four shapes where it returned the **wrong** directory, and a wrong artifacts directory is the worst outcome available here: if stale artifacts happen to sit there, it deploys old bytecode and reports success. Reading a value out of arbitrary JavaScript needs a parser, which is far too much machinery for a fallback whose alternative is one line of config.

  The durable fix is for `generate` to record the path it resolved — it already receives the correct one — so a deploy never re-derives it. That is a separate change.

## 0.7.0

### Minor Changes

- 2103372: `generate` and `init` notice a `.gitignore` rule that would keep deployoor's output out of the repo, and offer to remove it

  Everything deployoor writes is now meant to be committed — `deployments/` always was, and the deployers became small enough to diff once they stopped inlining `standardJsonInput`. The docs used to say the opposite, so the projects most likely to carry a `deployers` ignore rule are the ones that followed them.

  Both commands now check the configured `out` and `deploymentsPath` and report any rule covering them:

  ```text
  deployoor: git is ignoring output that is meant to be committed:
    .gitignore:4 (`deployers`) ignores deployers/ — the generated deployers, which a fresh
    clone cannot typecheck or deploy without
  deployoor: remove line 4 of .gitignore now? [y/N]
  ```

  Only an explicit `y` edits a file, and with no TTY nothing is asked and nothing changes, so CI never rewrites a `.gitignore`. Accepting also removes a deployoor comment introducing the rule, rather than leaving it above nothing.

  The question goes to `git check-ignore`, not to a parser here, so nested ignore files, `.git/info/exclude`, `core.excludesFile` and negations are all accounted for — a `!deployers/` you already added means you are not asked. Two cases are reported and left alone: a pattern broader than deployoor's output (`build`, when `out` is `./build/deployers`), because removing it would un-ignore everything else under it; and a rule in a file outside the project, because it is clone- or machine-wide. Outside a git repository, or with no `git` on PATH, nothing is reported rather than guessed.

  Nothing here runs from `generateDeployers`, only from the CLI — a build hook like `@deployoor/hardhat` is the wrong place to ask a question or to repeat the same advice on every compile.

  `init` also scaffolds from the project rather than from a fixed template: the config it writes names the detected toolchain and where deployoor resolved the artifacts directory. `artifactsPath` stays commented out even when your framework's config moves it, since deployoor reads that config itself and a copy would be free to drift. `runInit` is now async as a result.

  Two safety details worth naming. The "is this file inside the project" test compares **canonical** paths: git does not follow a symlinked `.gitignore` but does follow one used as `core.excludesFile`, so a link inside the project can name a target outside it, and a lexical comparison would call that editable and then write through the link. And the advice for a broader pattern no longer suggests a bare negation — git does not descend into an excluded directory, so `!build/deployers/` under a `build` rule does nothing; it now says to move `out` or widen the rule to `build/*` first.

  `runInit` creates the config with `wx` rather than checking `existsSync` first, since detection is async and a check before it left a window in which a concurrent run's file would be truncated.

- 197cfb9: `deployers/` is now small enough to commit, and the deploy path reads the rest from your compiled
  artifacts.

  **What `generate` emits changed.** A generated artifact module carried the abi _and_ the bytecode,
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
  errors: `ContractArtifactNotFound` names the contract and lists what _was_ compiled, so a rename is
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
  and `Artifact` are not modified. Artifacts are read fresh on every resolve, so a recompile is always
  picked up; a scan measures well under a millisecond against a deploy that spends seconds on the
  network.

- 5655eb2: New command: `deployoor verify` — verify already-deployed contracts on a block explorer after the
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

- fc43ab6: `deployoor generate` now works on a stock project with no deployoor config at all, and figures out a
  non-stock one by reading the framework's own config.

  **`deployoor.config.ts` is optional.** `generate` used to throw `no deployoor.config found` when a
  project had no config file. Every `Config` option already had a default, so it now generates with
  those defaults:

  ```bash
  npx hardhat compile && npx deployoor generate
  ```

  Deployers emitted for a project with no config carry the defaults inline
  (`defineDeployer(artifact, {} satisfies Config)`) rather than importing a config module, so the
  emitted tree has nothing to resolve. Projects that do have a `deployoor.config.*` are unaffected: the
  deployers still import it, and running `deployoor init` later is a type-compatible swap. `init` keeps
  its job, which is taking control of the defaults (paths, `include`, `redeploymentStrategy`, plugins).

  **The artifacts directory is read from your framework's config.** deployoor now takes
  `paths.artifacts` from `hardhat.config.*` and `out` from the active `foundry.toml` profile, so a
  project that keeps its build output somewhere other than `artifacts/` or `out/` needs no deployoor
  config either. Reading hardhat.config is best-effort, since it is arbitrary user code that can import
  plugins or fail to load; a failure falls back to the framework default rather than aborting the run.
  `FOUNDRY_PROFILE` is honoured.

  **New `artifactsPath` config option**, for the cases the above cannot cover (an output directory that
  neither config states). It takes precedence over both.

  **`ArtifactsNotFound` says what actually went wrong.** It used to always advise "Compile first",
  which is misleading for a project that did compile and writes elsewhere, and it never said that no
  toolchain could be detected. It now names the detected framework and the file that gave it away, and
  distinguishes: nothing compiled yet, an output directory the framework's own config already points at
  (so there is nothing left to configure), a wrong `artifactsPath`, and no toolchain at all, which lists
  every marker it looked for.

  **`generate` offers to install its own dependencies.** The generated deployers import `deployoor` and
  `viem`, so generating into a project that has not declared them leaves a tree that cannot compile.
  Instead of only naming the command, `generate` now asks, using the package manager it detects from
  your lockfile:

  ```text
  deployoor: run `pnpm add -D deployoor viem` now? [y/N]
  ```

  Only an explicit `y` installs. Without a TTY (CI, a piped run) it never prompts and fails with the
  command to run, so nothing is installed behind your back.

### Patch Changes

- dd8cb2a: Groundwork for committable `deployers/`, inert on its own.

  Adds the `GeneratedArtifact<A>` type — the shape `deployoor generate` will emit once the deployers
  carry only what cannot be recovered from a compiled artifact — and an abi canonicaliser that answers
  "is this the same interface?" while ignoring solc key order, abi entry order and `internalType`.

  Nothing emits or consumes either yet, so there is no behaviour change. The release note for the
  feature lands with the change that wires them up.

## 0.6.0

### Minor Changes

- 1cb8250: Use viem's `Hex`/`Address` types, cap peer ranges below the next major, and remove the deprecated `force` option.

  **BREAKING (pre-1.0)**

  - The `force` option is **gone** (it was deprecated one release ago and never shipped in that state): replace `force: true` with `redeploymentStrategy: 'always'` and `force: false` with `redeploymentStrategy: 'never'`.
  - `deployoor`'s zod validators are renamed to free the bare names for viem's types: `Hex` → `HexSchema`, `Address` → `AddressSchema`, `Bytecode` → `BytecodeSchema` (matching the existing `AbiSchema`). The exported record/artifact **types** are unchanged — they now spell their hex fields as viem's `Hex` and `Address`, which are structurally identical to the `` `0x${string}` `` they replace, so consumers need no change.

  **Peer ranges**

  viem 3 is imminent and `>=2` would have accepted it silently. Every `viem` peer is now `^2`; `@wagmi/cli` is `^2`, `@tevm/compiler` is capped `<2`, and `solc` `<0.9`. The plugin packages' `deployoor` peer was `*` — accepting any engine version, including breaking pre-1.0 minors — and is now `>=0.5.0 <1.0.0`. `@deployoor/testing` and `fhevm-tevm-mocks` additionally declared `viem >=2.49`, a floor their own catalog version (2.44.2) did not satisfy and that nothing required (tevm itself asks for `^2.37.9`). `@deployoor/wagmi` now declares the `viem` peer it always implicitly relied on.

  **Internal**

  - One `ensureHexPrefix` helper in `artifacts/parse.ts` replaces two copies of the "0x-prefix raw solc output" logic (`parse.ts` and `artifacts/tevm.ts`). It is deliberately not viem's `toHex`, which _encodes_ a string rather than prefixing it, and cannot assert `isHex` because unlinked bytecode legitimately contains `__$…$__` placeholders.
  - Fixed-width hex fields are built with `numberToHex(n, { size })` / `concatHex` / byte-indexed `slice` instead of `.toString(16).padStart(...)` and character arithmetic.
  - No `let`, `var`, or reassignment anywhere in the codebase, enforced by oxlint (`no-var`, `prefer-const`, `no-const-assign`, `no-param-reassign`, `no-plusplus`). The accumulator in `codegen/generate.ts` is a `.flatMap`, the tevm fully-qualified-name dedupe is a `.reduce`, and the deploy tests get their EVM clients from a top-level `await` rather than a `let` filled in by `beforeAll`.
  - Dropped a duplicate `tevm` devDependency in `fhevm-tevm-mocks` (already a `dependencies` entry at the same version).

- 1cb8250: Harden `redeploymentStrategy` and make the pinned verification sources content-addressed.

  - **A v1 record no longer redeploys on a comment-only recompile.** The v1 fallback compared raw creation bytecode, which carries the same trailing CBOR metadata hash as the runtime code — so upgrading deployoor and recompiling redeployed every existing contract on the first run under the new `'on-change'` default. Both sides are now metadata-stripped.
  - **Constructor args are compared by their ABI encoding**, not their JSON shape, so `1`, `1n`, and the `"1"` a record stores are one value. This is the canonicalisation `identityHash` already applied to the whole tuple, so the component diff and the hash now agree by construction. Both sides of a pair must encode for the encoded comparison to count: viem's address encoder accepts an all-lowercase address but rejects a non-checksummed mixed-case one, so encoding per value would compare an ABI key against a JSON key — two key spaces that can never be equal — and report a change that isn't one. Address casing is folded away by the shared JSON fallback.
  - **`stripMetadata` is total.** It parsed the trailing bytes as a length without checking they were hex, so bytecode ending in an unlinked `__$…$__` library placeholder threw — surfacing as an untagged defect from the diff path, which documents itself as non-throwing.
  - **Pinned verification sources are content-addressed**, at `deployments/sources/<hash>.json` with a `sourcesHash` on the record, replacing the per-record `<Name>.sources.json` sidecar. A standard-json input is the whole compilation unit, so the previous layout meant one copy of every source file per contract _per chain_; identical input is now stored once. `reset` collects blobs no remaining record references instead of deleting by name, so a blob another chain still points at survives. Pinning is best-effort: the deploy is already confirmed by then, so a store that cannot write sources logs a warning and the record is written without a `sourcesHash` rather than the whole call failing.

    Custom `StoreAdapter` implementations need updating: `writeSources(hash, sources)` and `readSources(hash)` are keyed by the content hash (typed `Hex`) rather than `(network, name)`, and `removeSources` is replaced by `pruneSources()`, which drops every blob no surviving record references.

  - **Records store a `codeHash`, not a second copy of the runtime bytecode.** Verification never reads it — a standard-json verify submits the pinned sources and the explorer recompiles — so the field is an artifact-side code identity, at 32 bytes instead of ~24KB of hex per contract per chain. It is `keccak` of the **metadata-stripped** runtime bytecode, so comparing it to on-chain code means stripping the trailing CBOR from `eth_getCode` first, and it will not match at all for a contract with `immutable` variables, whose deployed code has the values written in. It is omitted (rather than silently meaning something else) when the runtime bytecode still carries unlinked library placeholders, because viem's `keccak256` does not reject non-hex input — it falls through to hashing the text.
  - **`identityHash` is omitted rather than substituted** when the identity is not computable. It previously fell back to a bare code hash, which can never equal a real identity hash and so bought exactly one spurious redeploy; absent, the reuse test falls back to the component diff.
  - **`register` appends to history instead of replacing it.** Re-registering an external contract at a new address kept only the new entry and recorded no `supersededAddress`. Re-registering the _same_ address appends nothing, so a repeated script run no longer grows the log.

  Upgrading: existing `deployments/**/<Name>.sources.json` files are no longer read or written, and nothing backfills them — a record only gains a `sourcesHash` when it is next deployed. Keep the legacy files until the records beside them carry a `sourcesHash`; for a deployment you never redeploy, the old sidecar stays the only pinned copy of its sources.

- 1d04bfd: Add `redeploymentStrategy` and redeploy-on-change.

  `getOrDeploy` now decides reuse-vs-redeploy by a `redeploymentStrategy` — `'on-change'` (the new default), `'never'`, or `'always'` — settable per call, as a config default, or per chain via `redeploymentStrategyByChainId`. `'on-change'` redeploys when the **deploy identity** (metadata-stripped runtime bytecode + constructor args + linked library addresses) changes, so a redeployed dependency's new address cascades through the contracts that take it — while a comment-only recompile does not redeploy.

  Deployment records are now `schemaVersion: 2`: they carry a `codeHash`, an `identityHash`, and an append-only `history` of every (re)deploy with a descriptive `reason`/`summary` (v1 records still read, and upgrade in place on the next deploy). Each deploy also pins the exact solc standard-json input it used, so a deployment stays verifiable on a block explorer later — independent of the current source tree.

  BREAKING (pre-1.0): the default is now `'on-change'` rather than reuse-only, so a changed contract redeploys on re-run. Set `redeploymentStrategy: 'never'` (globally or per chain) to restore the old behaviour. The boolean `force` option is **removed**: replace `force: true` with `redeploymentStrategy: 'always'` and `force: false` with `redeploymentStrategy: 'never'`.

### Patch Changes

- d7acf57: Update the package description to lead with what deployoor is: deploy EVM contracts from TypeScript with your own viem wallet, where a deploy is an artifact plus a client so scripts, tests, and your app share the same typed contract objects. No code change.

## 0.5.0

### Minor Changes

- ecab8f9: Add Hardhat 3 and tevm support to `deployoor generate`.

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

  `generate` is now async internally (the tevm adapter compiles on demand); the `deployoor generate`
  CLI and the exported `generateDeployers` keep the same signatures — `generateDeployers` was already
  `async` and returned a `Promise`, so programmatic callers already `await` it. New config fields:
  `framework` and `sources`.

## 0.4.0

### Minor Changes

- 7913ff9: Point repository metadata at `raycashxyz/deployoor` after transferring the GitHub org.

## 0.3.0

### Minor Changes

- 7c4faa2: Generate deployers for library-linked contracts, record the library map, and let `register` run with only a public client.

  - `deployoor generate` no longer silently drops a contract whose bytecode carries solc's unlinked library placeholders (`__$…$__`). The artifact and deployment-record bytecode boundary now accepts placeholders via a new `Bytecode` validator (`Hex` stays strict for addresses and tx hashes), so a library-dependent contract gets a typed `getOrDeploy<Name>` — its addresses are linked at deploy time from the `libraries` call option, and the deployment record now also stores that `libraries` map.
  - `deployoor generate` warns when an explicit `include` name matches no deployable contract (a typo, or a contract that failed to compile) instead of dropping it silently.
  - `register(...)` no longer requires a `walletClient`: it only records an existing address, so a `publicClient` is enough. Pass a wallet to record it as the registrant and get a writable contract back; omit it and the deployer is recorded as the zero address (read-only contract).

## 0.2.0

### Minor Changes

- 2a34f70: Harden deployment records and test helpers: records now carry `schemaVersion: 1`, use chain-id-based filesystem keys, guard chainId mismatches on reuse, warn on stale bytecode/constructor args, and write filesystem records atomically under a lock. `@deployoor/testing` now exposes tevm, cheatcodes, fixtures, and deployment-record seeding (seeded records are remapped onto the in-memory chain so `getOrDeploy` reuses them). Verifier plugins can retry reused deployments when artifact metadata is available, Slack can notify failed deploys, and the wagmi plugin uses Zod 4-safe validators with ABI drift checks.

  **BREAKING (pre-1.0):** the record folder layout changed from `deployments/<chain name>/` to `deployments/<chainId>-<slug>/` (e.g. `deployments/sepolia/` → `deployments/11155111-sepolia/`), and the record's `networkName` field now holds that composite key. Records written by 0.1.x are not read from the old location — move each folder to its new name (and update `networkName` inside the files, or let the next deploy rewrite them) before re-running deploy scripts, or `getOrDeploy` will redeploy.

- 2a34f70: Expose `register` and `reset` as project-level entry points. `deployoor generate` now emits both in the deployers index (config-bound, scoped to the client's chain): `register({ walletClient, publicClient, deploymentName, address, abi })` records a contract you didn't deploy (e.g. USDC) with no transaction and returns its viem object, and `reset({ publicClient, deploymentName? })` forgets recorded deployment(s) so the next `getOrDeploy` redeploys. Adds the public factories `defineRegister` / `defineReset`. The older `name` spelling is accepted as a compatibility alias.

  Registered records are marked `kind: "external"`, and `register` will not overwrite a real deployment at the same `(chain, name)` — it fails with `DeploymentExists` (reset it first, or use a different name); re-registering an external record updates it. `reset` is a pure local-records operation and needs only a `publicClient` (no signer).

  Also documents `deploymentName` (defaults to the contract name) for deploying and tracking multiple instances of the same contract.

- c12b352: `getOrDeploy` and `register` now resolve to a `DeployResult` — `{ contract, deployment, freshDeploy, receipt? }` — instead of the bare viem contract. `contract` is the typed viem object (same one as before); `freshDeploy` is `true` only when the call broadcast a deploy transaction (so it is `false` on idempotent reuse and always for `register`); `receipt` is the deploy receipt, present only on a fresh deploy; `deployment` is the full record. This lets a deploy script run one-time setup only when it actually deployed.

  **BREAKING (pre-1.0):** callers that used the return value as a contract must destructure it — `const token = await getOrDeployToken(...)` becomes `const { contract: token } = await getOrDeployToken(...)`.

  Also adds the `deployoor/generate` subpath, exporting `generateDeployers({ root })` — the programmatic form of `deployoor generate` (discover config → read artifacts → write typed deployers) so a build tool can run generation in process. `@deployoor/hardhat` uses it.

### Patch Changes

- 4e505d0: Compat hardening from packaging/resolution audit: `sideEffects: false` on all publishable packages; `typesVersions` on `deployoor/plugin` and `deployoor/generate` for legacy `moduleResolution: "node"`; Node `>=20` engines on tevm-dependent packages; align tevm as a hard dependency and declare `viem >=2.49` where tevm requires it; document TypeScript-first codegen and CJS/ESM caveats; add a Windows CI smoke job.

## 0.1.0

### Minor Changes

- 15fab66: Initial public release of deployoor: viem-first contract deployment with a `deployments/` source of truth, idempotent `getOrDeploy<Name>` deployers, the `deployoor/plugin` lifecycle SDK, and the `@deployoor/wagmi` / `@deployoor/etherscan` / `@deployoor/sourcify` / `@deployoor/slack` plugins.
