# @deployoor/evals

Measures whether an agent reaches for deployoor, and whether it then uses it correctly. Private to
the repo; nothing here is published.

Two evals, designed in `.scratch/agent-adoption/issues/08-eval-harness-design.md`.

## Cold start

Does an agent offer deployoor when nobody has mentioned it? This is the acceptance instrument for
the whole agent-adoption effort.

Five prompts in `src/cold-start/prompts.ts`, from a generic "start a new Solidity project" up to
deployoor's exact problem statement without naming it. They are scored separately and never
averaged: rung 1 is the honest headline, rung 5 is the one that has to move first. No prompt names
deployoor or any deployoor concept, because a prompt that leads the agent to the answer measures
nothing.

Each run is scored on a four-level ordinal. **chosen** means named in the final recommendation as
the thing to use, **offered** means presented among options, **mentioned** means it appears without
being recommended, **absent** means it does not appear. Only `absent` is decided by script, from
whether the transcript contains the name at all. The rest is read by a person: the line between
chosen and offered is a reading of the recommendation, and a model judging a model would inherit the
stochasticity this eval exists to measure.

```bash
pnpm --filter @deployoor/evals cold-start -- --out ../.scratch/agent-adoption/evals/<date> --attempts 5
```

Runners are command templates in `src/lib/runners.ts`, so this measures what a developer's agent
actually does rather than what a raw completion says. Every run happens in a throwaway directory, so
an agentic harness that decides to scaffold something writes it somewhere harmless.

Results, including the raw transcripts, go to `.scratch/agent-adoption/evals/<date>/`, which is
gitignored. The harness is public because it is ordinary code and worth reading; the numbers stay
local until they say something worth publishing.

`summary.json` records the harness version and Node version for every run. A harness upgrade moves
these numbers as much as a deployoor change does, and without the version pinned there is no way to
tell the two apart later.

## Operation

Not built yet. Designed in the same ticket: fixtures copied from `examples/` (hardhat, hardhat-v3,
foundry), five tasks with scripted assertions, and wrong moves counted by pattern over the
transcript's tool calls. It guards against a tool that gets picked and then fails in use, so it is
worth building alongside the changes it guards rather than before them.

## Cadence

The chat-only cold start runs monthly, and before and after any shipped change. The agentic tracks
run monthly, plus around a change that claims to move them. No eval runs in CI: these call
rate-limited harnesses on one developer's account, and they cost money.
