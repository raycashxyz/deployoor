---
"deployoor": patch
---

Say clearly when a hardhat.config cannot be read, instead of guessing at `paths.artifacts`

deployoor finds a Hardhat project's artifacts by importing `hardhat.config.*`. A config that registers a plugin — `require("@deployoor/hardhat")`, or any plugin a real project uses — **cannot be imported outside a Hardhat run**: it throws `HH5: HardhatContext is not created`. deployoor then falls back to the framework default.

That is worth knowing about, because the shape hides it: `generate` succeeds while a _deploy_ fails, since the Hardhat plugin hands the resolved path over directly and only a deploy or a test has to read the config itself. Set `artifactsPath` in `deployoor.config.ts` for those projects — `examples/custom-paths` shows it, with the reasoning.

A text fallback that read the literal `paths.artifacts` out of the source was tried and removed before release. Four rounds of review found four shapes where it returned the **wrong** directory, and a wrong artifacts directory is the worst outcome available here: if stale artifacts happen to sit there, it deploys old bytecode and reports success. Reading a value out of arbitrary JavaScript needs a parser, which is far too much machinery for a fallback whose alternative is one line of config.

The durable fix is for `generate` to record the path it resolved — it already receives the correct one — so a deploy never re-derives it. That is a separate change.
