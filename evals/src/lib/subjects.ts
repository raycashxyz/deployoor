import { Effect } from "effect";

import { transcript, type HarnessFailed, type HarnessMissing, type HarnessTimedOut } from "./harness.ts";
import {
  answer,
  API_KEY_VARIABLE,
  BASELINE_MODELS,
  MODELS,
  type AnswerTruncated,
  type ApiKeyMissing,
  type ModelFailed,
} from "./models.ts";
import { FIXTURE_ID, fixtureAnswer } from "./fixture.ts";
import { isAvailable, probeVersion, RUNNERS, type Runner } from "./runners.ts";

/**
 * What the ladder is put to. Either a model over HTTP, which is the chat-only track and answers from
 * weights, or a coding-agent CLI, which is the agentic track and may search the web and write files.
 */
export type Subject =
  | { readonly kind: "fixture"; readonly id: string; readonly track: "fixture" }
  | { readonly kind: "model"; readonly id: string; readonly track: "chat-only" }
  | {
      readonly kind: "cli";
      readonly id: string;
      readonly track: "agentic";
      readonly runner: Runner;
    };

export type AskError =
  ApiKeyMissing | ModelFailed | AnswerTruncated | HarnessMissing | HarnessTimedOut | HarnessFailed;

export const ALL_SUBJECTS: readonly Subject[] = [
  { kind: "fixture", id: FIXTURE_ID, track: "fixture" },
  ...MODELS.map((id): Subject => ({ kind: "model", id, track: "chat-only" })),
  ...RUNNERS.map((runner): Subject => ({ kind: "cli", id: runner.id, track: "agentic", runner })),
];

/** What `pnpm eval` measures: the five-lab chat-only track, and no CLIs. */
export const DEFAULT_SUBJECT_IDS = BASELINE_MODELS.join(",");

/**
 * What produced an answer, precisely enough to compare with next month's run. A model id already
 * names its version; a CLI has to be asked.
 */
export const versionOf = (subject: Subject): string => {
  if (subject.kind === "cli") return probeVersion(subject.runner);
  return subject.id;
};

export const ask = (subject: Subject, prompt: string, rung: string): Effect.Effect<string, AskError> => {
  if (subject.kind === "fixture") return fixtureAnswer(rung);
  if (subject.kind === "model") return answer(subject.id, prompt);
  return transcript(subject.runner, prompt);
};

export interface SelectionDeps {
  readonly ids?: string;
  readonly available?: (runner: Runner) => boolean;
  readonly apiKey?: string | undefined;
}

/**
 * The subjects this run asks.
 *
 * Every failure throws rather than filters, because each one used to look exactly like a healthy
 * result. A typo narrowed the list to nothing and evalite reported a clean run of zero rows. A CLI
 * named but not installed was dropped silently, so the matrix shrank to whatever was on the machine.
 * A missing API key surfaced once per row instead of once, burying the one line that says what to do.
 */
export const subjectsUnderTest = ({
  ids = process.env.EVAL_SUBJECTS ?? DEFAULT_SUBJECT_IDS,
  available = (runner) => isAvailable(runner),
  apiKey = process.env[API_KEY_VARIABLE],
}: SelectionDeps = {}): readonly Subject[] => {
  const requested = ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const unknown = requested.filter((id) => !ALL_SUBJECTS.some((subject) => subject.id === id));
  if (unknown.length > 0)
    throw new Error(
      `EVAL_SUBJECTS names nothing known: ${unknown.join(", ")}. Known subjects: ${ALL_SUBJECTS.map((subject) => subject.id).join(", ")}`,
    );

  const chosen = ALL_SUBJECTS.filter((subject) => requested.includes(subject.id));

  const missing = chosen.filter((subject) => subject.kind === "cli" && !available(subject.runner));
  if (missing.length > 0)
    throw new Error(
      `EVAL_SUBJECTS asked for ${missing.map((subject) => subject.id).join(", ")}, but the binary is not on PATH`,
    );

  // The fixture needs neither a key nor a binary, which is the point of it.
  if (chosen.some((subject) => subject.kind === "model") && !apiKey)
    throw new Error(
      `EVAL_SUBJECTS includes models, so ${API_KEY_VARIABLE} must be set. Copy evals/.env.example to evals/.env and fill it in.`,
    );

  return chosen;
};
