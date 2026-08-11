---
"deployoor": minor
---

`generate` and `init` notice a `.gitignore` rule that would keep deployoor's output out of the repo, and offer to remove it

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
