# @deployoor/evals

Measures whether an agent reaches for deployoor, and whether it then uses it correctly. Private to
the repo; nothing here is published, and nothing here runs in CI.

Built on [evalite](https://www.evalite.dev), which is vitest underneath: `.eval.ts` files, custom
scorers, trial counts for non-deterministic runs, a local UI for reading transcripts, and a SQLite
history so month-over-month movement comes for free.

## Two tracks, two mechanisms

**Chat-only** asks models directly over the AI SDK through OpenRouter. It measures what the
ecosystem's weights recommend, across five labs, and adding a lab is a line in `src/lib/models.ts`.
It needs `OPENROUTER_API_KEY`: copy `.env.example` to `.env` and fill it in. The same key is in the
repo's GitHub secrets.

**Agentic** spawns real coding-agent CLIs, because no HTTP call makes an agent search the web and
scaffold a project. It needs those CLIs installed and logged in, and no API key.

An earlier version ran the chat-only track by spawning Claude Code with its tools denied. That was a
subprocess standing in for an HTTP call: brittle, one lab, and it measured a coding agent pretending
not to be one.

## Running it

```bash
pnpm --filter @deployoor/evals smoke       # one cheap model, a quarter of a penny
pnpm --filter @deployoor/evals eval        # the five-lab measurement, about 30p
pnpm --filter @deployoor/evals eval:dev    # the same, with the UI on localhost:3006
```

`smoke` is for developing the harness: do rows complete, does the scorer fire, does the table
render. `eval` is for measuring. The distinction matters more than the money — the whole lesson of
this eval so far is that the subject _is_ the measurement, so a cheap stand-in produces numbers that
look like a baseline and are not one.

Per five-rung pass, at the time of writing:

| model                       | output $/M | per pass |
| --------------------------- | ---------- | -------- |
| openai/gpt-5-nano           | 0.40       | $0.0024  |
| deepseek/deepseek-chat-v3.1 | 1.65       | $0.0099  |
| moonshotai/kimi-k2.5        | 3.00       | $0.018   |
| anthropic/claude-sonnet-5   | 10.00      | $0.060   |
| openai/gpt-5.1              | 10.00      | $0.060   |
| google/gemini-2.5-pro       | 10.00      | $0.060   |

Widen a real run with the environment:

```bash
EVAL_TRIALS=5 pnpm --filter @deployoor/evals eval                        # the designed five per cell
EVAL_SUBJECTS=codex:agentic,claude-code:agentic EVAL_CONCURRENCY=1 \
  pnpm --filter @deployoor/evals eval                                    # the agentic track
```

Drop concurrency to 1 for CLI-heavy runs: those share one local account and its rate limit, while
the model calls are independent HTTP requests to different providers.

Cost, since the key carries a $2 monthly cap: a baseline pass is about 30p and a five-trial pass is
about $1.50, so the monthly cadence is one trial per cell and development happens on `smoke`.
`MAX_OUTPUT_TOKENS` bounds the worst case, and an answer that hits it fails as `AnswerTruncated`
rather than being scored `absent`, so a budget cap can never quietly become a finding.

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

Agentic runs happen in a throwaway directory whose prefix is deliberately neutral: harnesses echo
their working directory into the transcript, so a prefix containing the product name scores itself.

## Known gap

The design also wanted a `usedWebSearch` axis per run, separating discovery from weights and
discovery from an index. The track now answers it at the coarse level, since the model track cannot
search at all, but within an agentic run it is still undecidable: those tool calls do not reliably
appear in text output. Doing it properly needs `--output-format stream-json` and a parser per
harness.

## Operation

Not built yet, and blocked on ticket 04. Designed alongside the cold start: fixtures copied from
`examples/`, five tasks with scripted assertions, and wrong moves counted by pattern over the
transcript's tool calls. One of those patterns is "invoked a `deploy` subcommand that does not
exist", which stops being a wrong move the moment that command ships.

## Cadence

Monthly, and before and after any shipped change. These call rate-limited harnesses on one
developer's account and cost money, so the config runs them serially and nothing triggers on a push.
