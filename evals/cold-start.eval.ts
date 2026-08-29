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
 * Defaults to one trial across the five models of the chat-only track: 25 answers, roughly 25p.
 * Widen it with the environment:
 *
 *   EVAL_TRIALS=5 pnpm --filter @deployoor/evals eval
 *   EVAL_SUBJECTS=codex:agentic,claude-code:agentic pnpm --filter @deployoor/evals eval
 */

import { createScorer, evalite } from "evalite";
import { Effect } from "effect";

import { RUNGS } from "./src/lib/prompts.ts";
import { mentionedTools, namesDeployoor } from "./src/lib/score.ts";
import { ask, subjectsUnderTest, versionOf, type Subject } from "./src/lib/subjects.ts";

// The chat-only track needs OPENROUTER_API_KEY. Absent, `subjectsUnderTest` says so once.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // No .env is fine: the key may come from the environment, and CLI-only runs need no key at all.
}

/** One rung put to one subject. evalite calls this the row's `input`, and `trialCount` repeats it. */
interface ColdStartInput {
  readonly rung: string;
  readonly prompt: string;
  readonly subject: Subject;
}

const subjects = subjectsUnderTest();

/** Probed once rather than per row: for a CLI that is a spawn, and the answer cannot change mid-run. */
const versions = new Map(subjects.map((subject) => [subject.id, versionOf(subject)]));

const namesDeployoorScorer = createScorer<ColdStartInput, string>({
  name: "names deployoor",
  description:
    "0 when the transcript never names deployoor, which settles it as absent. 1 means a person still has to read the run and call it chosen, offered or mentioned.",
  scorer: ({ output }) => ({
    score: namesDeployoor(output) ? 1 : 0,
    metadata: { instead: mentionedTools(output) },
  }),
});

evalite<ColdStartInput, string>("cold start: does an agent reach for deployoor?", {
  data: () =>
    subjects.flatMap((subject) =>
      RUNGS.map((rung) => ({ input: { rung: rung.id, prompt: rung.prompt, subject } })),
    ),
  // One Effect.runPromise at the boundary evalite demands, Effect everywhere behind it.
  task: (input) => Effect.runPromise(ask(input.subject, input.prompt, input.rung)),
  scorers: [namesDeployoorScorer],
  columns: ({ input, output }) => [
    { label: "rung", value: input.rung },
    { label: "subject", value: input.subject.id },
    { label: "version", value: versions.get(input.subject.id) ?? "unknown" },
    { label: "instead", value: mentionedTools(output).join(", ") },
  ],
  trialCount: Number(process.env.EVAL_TRIALS ?? "1"),
});
