---
"deployoor": minor
---

`deployoor generate` now works on a stock project with no deployoor config at all, and figures out a
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
