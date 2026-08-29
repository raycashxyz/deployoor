/**
 * The harnesses a cold-start prompt is put to, and how to drive each one headlessly.
 *
 * A runner is a command template rather than an SDK call, so the eval measures what a developer's
 * agent actually does rather than what a raw model completion says. The version of each harness is
 * probed at run time and recorded with the results: a harness upgrade moves these numbers as much
 * as a deployoor change does, and without the version pinned there is no telling them apart later.
 */

import { spawnSync } from "node:child_process";

/**
 * Prefix for the throwaway directory each run happens in.
 *
 * Deliberately neutral. The first baseline used `deployoor-eval-`, and every agentic harness echoes
 * its working directory into the transcript, so the scorer found the product name in runs that had
 * never heard of it: five false positives out of ten. One harness went further and named the project
 * it scaffolded after the directory. `test/score.test.ts` asserts this prefix cannot trip the
 * detector.
 */
export const WORKSPACE_PREFIX = "agent-eval-";

export interface Runner {
  readonly id: string;
  readonly harness: string;
  readonly model: string;
  /** `chat-only` answers from weights alone; `agentic` may search the web and touch a filesystem. */
  readonly track: "chat-only" | "agentic";
  readonly file: string;
  readonly argv: (prompt: string) => readonly string[];
  /** Command that prints the harness version, for the results header. */
  readonly versionArgv: readonly string[];
}

/** Every built-in tool, so the chat-only track answers from weights and nothing else. */
const DENIED_TOOLS = [
  "Bash",
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "Write",
  "Edit",
  "NotebookEdit",
  "TodoWrite",
] as const;

export const RUNNERS: readonly Runner[] = [
  {
    id: "claude-code:no-tools",
    harness: "claude-code",
    model: "default",
    track: "chat-only",
    file: "claude",
    // `--allowed-tools ""` does not disable anything: a run given it still read the filesystem.
    // Denying the built-in tools by name is what actually leaves the model answering from weights.
    argv: (prompt) => ["-p", prompt, "--disallowed-tools", ...DENIED_TOOLS],
    versionArgv: ["--version"],
  },
  {
    id: "claude-code:agentic",
    harness: "claude-code",
    model: "default",
    track: "agentic",
    file: "claude",
    argv: (prompt) => ["-p", prompt],
    versionArgv: ["--version"],
  },
  {
    id: "codex:agentic",
    harness: "codex",
    model: "default",
    track: "agentic",
    file: "codex",
    // `--skip-git-repo-check` because each run happens in a throwaway directory that is not a repo.
    argv: (prompt) => ["exec", "--skip-git-repo-check", prompt],
    versionArgv: ["--version"],
  },
];

/** What runs when `EVAL_RUNNERS` says nothing: the cheapest track, and the one that is the headline. */
export const DEFAULT_RUNNER_IDS = "claude-code:no-tools";

export interface SelectionDeps {
  /** Comma-separated runner ids. Defaults to the `EVAL_RUNNERS` environment variable. */
  readonly ids?: string;
  /** Whether a harness is installed. Defaults to spawning it. */
  readonly available?: (runner: Runner) => boolean;
}

/**
 * The harnesses this run puts the ladder to.
 *
 * Both failure modes throw rather than filter, because both used to be silent and both look exactly
 * like a healthy result. A typo in `EVAL_RUNNERS` narrowed the list to nothing, and evalite then
 * reported a clean run of zero rows. A harness that was named but not installed was quietly dropped,
 * so the matrix shrank to whatever happened to be on the machine and the summary said nothing about
 * what was missing.
 */
export const runnersUnderTest = ({
  ids = process.env.EVAL_RUNNERS ?? DEFAULT_RUNNER_IDS,
  available = (runner) => isAvailable(runner),
}: SelectionDeps = {}): readonly Runner[] => {
  const requested = ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const unknown = requested.filter((id) => !RUNNERS.some((runner) => runner.id === id));
  if (unknown.length > 0)
    throw new Error(
      `EVAL_RUNNERS names no such runner: ${unknown.join(", ")}. Known runners: ${RUNNERS.map((runner) => runner.id).join(", ")}`,
    );

  const chosen = RUNNERS.filter((runner) => requested.includes(runner.id));
  const missing = chosen.filter((runner) => !available(runner));
  if (missing.length > 0)
    throw new Error(
      `EVAL_RUNNERS asked for ${missing.map((runner) => runner.id).join(", ")}, but ${missing.map((runner) => runner.file).join(" and ")} is not on PATH`,
    );

  return chosen;
};

export const probeVersion = (runner: Runner): string => {
  const result = spawnSync(runner.file, [...runner.versionArgv], { encoding: "utf8" });
  return (result.stdout ?? "").trim().split("\n")[0] ?? "unknown";
};

/** Whether the harness is on PATH: spawning it is the test, so no shell is involved. */
export const isAvailable = (runner: Runner): boolean =>
  spawnSync(runner.file, [...runner.versionArgv], { encoding: "utf8" }).error === undefined;
