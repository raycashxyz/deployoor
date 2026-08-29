/**
 * The coding-agent CLIs the agentic track drives, and how to run each one headlessly.
 *
 * A runner is a command template rather than an SDK call, because the agentic track exists to
 * measure what a developer's agent does: it searches, it reads the filesystem, it scaffolds. There
 * is no HTTP call that reproduces that. The chat-only track went the other way and now asks models
 * directly over the AI SDK (`models.ts`), so nothing here pretends to be a bare model any more.
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
  readonly file: string;
  readonly argv: (prompt: string) => readonly string[];
  /** Command that prints the harness version, recorded with the results. */
  readonly versionArgv: readonly string[];
}

export const RUNNERS: readonly Runner[] = [
  {
    id: "claude-code:agentic",
    harness: "claude-code",
    file: "claude",
    argv: (prompt) => ["-p", prompt],
    versionArgv: ["--version"],
  },
  {
    id: "codex:agentic",
    harness: "codex",
    file: "codex",
    // `--skip-git-repo-check` because each run happens in a throwaway directory that is not a repo.
    argv: (prompt) => ["exec", "--skip-git-repo-check", prompt],
    versionArgv: ["--version"],
  },
];

/**
 * The harness version, for the results.
 *
 * A harness upgrade moves these numbers as much as a deployoor change does, so a result that does
 * not say which version produced it cannot be compared with next month's.
 */
export const probeVersion = (runner: Runner): string => {
  const result = spawnSync(runner.file, [...runner.versionArgv], { encoding: "utf8" });
  return (result.stdout ?? "").trim().split("\n")[0] ?? "unknown";
};

/** Whether the harness is on PATH: spawning it is the test, so no shell is involved. */
export const isAvailable = (runner: Runner): boolean =>
  spawnSync(runner.file, [...runner.versionArgv], { encoding: "utf8" }).error === undefined;
