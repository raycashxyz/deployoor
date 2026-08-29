/**
 * Does an agent offer deployoor when nobody has mentioned it?
 *
 * The acceptance test for the whole agent-adoption effort. Five prompts of rising specificity, from
 * a generic "start a new Solidity project" to deployoor's exact problem statement without its name,
 * put to real coding-agent CLIs rather than to a raw completion, because what a developer's agent
 * does is the thing being measured.
 *
 *   pnpm --filter @deployoor/evals eval          run once
 *   pnpm --filter @deployoor/evals eval:dev      run and open the UI on localhost:3006
 *
 * Defaults to one attempt on the chat-only runner, which is five runs and about two minutes. Widen
 * it with the environment:
 *
 *   EVAL_TRIALS=5 EVAL_RUNNERS=claude-code:no-tools,codex:agentic pnpm --filter @deployoor/evals eval
 */

import { createScorer, evalite } from "evalite";
import { Effect } from "effect";

import { transcript } from "./src/lib/harness.ts";
import { RUNGS } from "./src/lib/prompts.ts";
import { isAvailable, RUNNERS, type Runner } from "./src/lib/runners.ts";
import { mentionedTools, namesDeployoor } from "./src/lib/score.ts";

interface Cell {
  readonly rung: string;
  readonly prompt: string;
  readonly runner: Runner;
}

const requested = (process.env.EVAL_RUNNERS ?? "claude-code:no-tools").split(",");

const selected = RUNNERS.filter((runner) => requested.includes(runner.id) && isAvailable(runner));

const namesDeployoorScorer = createScorer<Cell, string>({
  name: "names deployoor",
  description:
    "0 when the transcript never names deployoor, which settles it as absent. 1 means a person still has to read the run and call it chosen, offered or mentioned.",
  scorer: ({ output }) => ({
    score: namesDeployoor(output) ? 1 : 0,
    metadata: { instead: mentionedTools(output) },
  }),
});

evalite<Cell, string>("cold start: does an agent reach for deployoor?", {
  data: () =>
    selected.flatMap((runner) =>
      RUNGS.map((rung) => ({ input: { rung: rung.id, prompt: rung.prompt, runner } })),
    ),
  // One Effect.runPromise at the boundary evalite demands, Effect everywhere behind it.
  task: (cell) => Effect.runPromise(transcript(cell.runner, cell.prompt)),
  scorers: [namesDeployoorScorer],
  columns: ({ input, output }) => [
    { label: "rung", value: input.rung },
    { label: "runner", value: input.runner.id },
    { label: "instead", value: mentionedTools(output).join(", ") },
  ],
  trialCount: Number(process.env.EVAL_TRIALS ?? "1"),
});
