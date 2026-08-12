# @deployoor/docs

## 0.0.2

### Patch Changes

- 0745971: Bring the docs, READMEs and examples in line with 0.7, and add a custom-paths example

  The examples' `deployers/` are now committed, and their `deployoor.config.ts` files are gone: all five set only `out` and `deploymentsPath` to the values that are already the defaults, so they demonstrated configuration nobody needs. `examples/custom-paths` is the one that does need a config, and shows exactly which paths require one.

  Stale prose corrected: three example READMEs described the deployers as gitignored; two referred to a config file that no longer exists; the root README listed `deployoor verify` and bytecode-diff redeploy as Planned when both shipped; TODO.md said nothing reads the pinned sources back.

- 3b54b89: Add a Verify contracts guide, a config step on the homepage, and drop the command tabs

  **New guide: [Verify contracts](https://deployoor.dev/guides/verify).** Both routes from one page — a verifier plugin at deploy time, and `deployoor verify` after the fact — plus what makes the second one possible (the record and its content-addressed standard-json sidecar), what each of the four verifiers needs, the three outcomes, and a troubleshooting section drawn from live runs rather than guesses.

  **The homepage gains a ninth, optional file: `deployoor.config.ts`.** It arrives last on purpose, after eight steps that never needed it — which is the honest way to introduce a file that is optional because every option has a default. The example shows moved folders, all four verifiers, and Slack.

  **The Install and Generate tabs are gone.** They existed to spell out a package manager and a per-framework compile, and `npx deployoor generate` now detects both: it reads the artifacts directory from your framework's own config and offers to install what is missing with the package manager your lockfile implies. The tabs described work the command does.

## 0.0.1

### Patch Changes

- b9a41cb: Rebuild the landing page around the project structure, and say that tests and deploys now need compiled artifacts.

  The homepage leads with the command, then walks the eight files a project actually gains — each with its contents, and which are optional. Three claims in the draft were falsified by 0.7 and are corrected: a deployer no longer bakes in the artifact — it carries the contract's name, its fully-qualified name and its abi, and reads bytecode and compiler settings from `artifacts/` at deploy time, which is why it is committable — the record's field is `constructorArgs`, and the emit is more than one file per contract.

  The testing guide never mentioned compiling, which 0.7 made load-bearing for anything deploying through a **generated** deployer. A hand-built `TypedArtifact` is the exception: it is used as given and never sends deployoor to disk.
