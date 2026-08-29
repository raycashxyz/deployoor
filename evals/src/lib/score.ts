/**
 * Scoring for the cold-start eval.
 *
 * The only automatic verdict is `absent`: a transcript that never names deployoor cannot have
 * offered it, and settling that by script keeps the cheap majority of runs free of judgement. Every
 * transcript that does name it is classified by hand, because the line between "chosen" and
 * "offered" is a reading of the recommendation, and a model judging a model would inherit exactly
 * the stochasticity this eval exists to measure.
 */

export const LEVELS = ["chosen", "offered", "mentioned", "absent"] as const;

export type Level = (typeof LEVELS)[number];

export const namesDeployoor = (transcript: string): boolean => /deployoor/i.test(transcript);

/** `absent` when the name never appears. `undefined` means a human still has to read this one. */
export const autoLevel = (transcript: string): Level | undefined =>
  namesDeployoor(transcript) ? undefined : "absent";

/** Tool names that mean a run reached the open web rather than answering from its weights. */
const SEARCH_TOOLS = ["websearch", "webfetch", "web_search", "web_fetch", "browser", "search"];

export const usedWebSearch = (toolNames: readonly string[]): boolean =>
  toolNames.some((name) => SEARCH_TOOLS.includes(name.toLowerCase()));

export interface RunRecord {
  readonly runner: string;
  readonly harness: string;
  readonly harnessVersion: string;
  readonly model: string;
  readonly track: "chat-only" | "agentic";
  readonly rung: string;
  readonly attempt: number;
  readonly level: Level | "unclassified";
  readonly usedWebSearch: boolean;
  readonly durationMs: number;
  readonly ok: boolean;
}

export type Tally = Record<Level | "unclassified", number>;

const EMPTY: Tally = { chosen: 0, offered: 0, mentioned: 0, absent: 0, unclassified: 0 };

/**
 * Counts per level. A distribution rather than a mean: the levels are ordinal, so averaging them
 * would invent a number that means nothing, and five runs could not support one anyway.
 */
export const tally = (runs: readonly RunRecord[]): Tally =>
  runs.reduce<Tally>((counts, run) => ({ ...counts, [run.level]: counts[run.level] + 1 }), EMPTY);
