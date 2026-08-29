/**
 * The harnesses a cold-start prompt is put to, and how to drive each one headlessly.
 *
 * A runner is a command template rather than an SDK call, so the eval measures what a developer's
 * agent actually does rather than what a raw model completion says. The version of each harness is
 * probed at run time and recorded with the results: a harness upgrade moves these numbers as much
 * as a deployoor change does, and without the version pinned there is no telling them apart later.
 */

import { spawnSync } from "node:child_process";

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

export const RUNNERS: readonly Runner[] = [
  {
    id: "claude-code:no-tools",
    harness: "claude-code",
    model: "default",
    track: "chat-only",
    file: "claude",
    argv: (prompt) => ["-p", prompt, "--allowed-tools", ""],
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

export const probeVersion = (runner: Runner): string => {
  const result = spawnSync(runner.file, [...runner.versionArgv], { encoding: "utf8" });
  return (result.stdout ?? "").trim().split("\n")[0] ?? "unknown";
};

/** Whether the harness is on PATH: spawning it is the test, so no shell is involved. */
export const isAvailable = (runner: Runner): boolean =>
  spawnSync(runner.file, [...runner.versionArgv], { encoding: "utf8" }).error === undefined;
