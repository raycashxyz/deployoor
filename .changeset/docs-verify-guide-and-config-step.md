---
"@deployoor/docs": patch
---

Add a Verify contracts guide, a config step on the homepage, and drop the command tabs

**New guide: [Verify contracts](https://deployoor.dev/guides/verify).** Both routes from one page — a verifier plugin at deploy time, and `deployoor verify` after the fact — plus what makes the second one possible (the record and its content-addressed standard-json sidecar), what each of the four verifiers needs, the three outcomes, and a troubleshooting section drawn from live runs rather than guesses.

**The homepage gains a ninth, optional file: `deployoor.config.ts`.** It arrives last on purpose, after eight steps that never needed it — which is the honest way to introduce a file that is optional because every option has a default. The example shows moved folders, all four verifiers, and Slack.

**The Install and Generate tabs are gone.** They existed to spell out a package manager and a per-framework compile, and `npx deployoor generate` now detects both: it reads the artifacts directory from your framework's own config and offers to install what is missing with the package manager your lockfile implies. The tabs described work the command does.
