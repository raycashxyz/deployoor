# @deployoor/evals

Measures whether an agent reaches for deployoor, and whether it then uses it correctly. Private to
the repo; nothing here is published, and nothing here runs in CI.

Built on [evalite](https://www.evalite.dev), which is vitest underneath: `.eval.ts` files, custom
scorers, trial counts for non-deterministic runs, a local UI for reading transcripts, and a SQLite
history so month-over-month movement comes for free.

## Running it

```bash
pnpm --filter @deployoor/evals eval        # run once, print the table
pnpm --filter @deployoor/evals eval:dev    # run and open the UI on localhost:3006
```

The default is one trial on the chat-only runner: five runs, about two minutes. Widen it with the
environment:

```bash
EVAL_TRIALS=5 pnpm --filter @deployoor/evals eval
EVAL_RUNNERS=claude-code:no-tools,claude-code:agentic,codex:agentic EVAL_TRIALS=5 \
  pnpm --filter @deployoor/evals eval
```

`evalite export` writes a static HTML bundle if a result is ever worth sharing.

## Cold start

Does an agent offer deployoor when nobody has mentioned it? This is the acceptance instrument for
the whole agent-adoption effort.

Five prompts in `src/lib/prompts.ts`, from a generic "start a new Solidity project" up to
deployoor's exact problem statement without naming it. They are scored separately and never
averaged: rung 1 is the honest headline, rung 5 is the one that has to move first. No prompt names
deployoor or any deployoor concept, because a prompt that leads the agent to the answer measures
nothing.

The rubric is a four-level ordinal. **chosen** means named in the final recommendation as the thing
to use, **offered** means presented among options, **mentioned** means it appears without being
recommended, **absent** means it does not appear. Only `absent` is decided by script, so the scorer
is binary on purpose: 0 is a settled absent, 1 means a person owes that run a read in the UI. There
is no judge model, because the line between chosen and offered is a reading of the recommendation
and a model judging a model would inherit the stochasticity this eval exists to measure.

The `instead` column is the more useful half of a run that scores 0: which tools the answer reached
for instead. That column is how the first baseline found that viem is already the default in more
than half of runs, and that Ignition, not hardhat-deploy, is the incumbent worth comparing against.

Runners are command templates in `src/lib/runners.ts`, so this measures what a developer's agent
actually does rather than what a raw completion says. Every run happens in a throwaway directory
whose prefix is deliberately neutral: harnesses echo their working directory into the transcript, so
a prefix containing the product name scores itself.

## Known gap

The design also wanted a `usedWebSearch` axis per run, separating discovery from weights and
discovery from an index. It is only decidable by construction today: the chat-only runner has tools
denied, so it is false there, and an agentic run's tool calls do not reliably appear in the text
output. Doing it properly needs `--output-format stream-json` and a parser per harness.

## Operation

Not built yet, and blocked on ticket 04. Designed alongside the cold start: fixtures copied from
`examples/`, five tasks with scripted assertions, and wrong moves counted by pattern over the
transcript's tool calls. One of those patterns is "invoked a `deploy` subcommand that does not
exist", which stops being a wrong move the moment that command ships.

## Cadence

Monthly, and before and after any shipped change. These call rate-limited harnesses on one
developer's account and cost money, so the config runs them serially and nothing triggers on a push.
