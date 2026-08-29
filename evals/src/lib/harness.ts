import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Data, Effect } from "effect";

import { WORKSPACE_PREFIX, type Runner } from "./runners.ts";

/**
 * Putting one prompt to one harness, as an Effect.
 *
 * A child process has four outcomes worth telling apart — the binary is not there, it ran out of
 * time, it exited non-zero, or it answered — and only the last one is a transcript. Deciding that
 * with `if (result.error) … else if (result.status !== 0)` is how a timed-out run gets scored as an
 * agent that simply did not mention deployoor, which is the failure this eval can least afford: it
 * reads as evidence.
 */

export class HarnessMissing extends Data.TaggedError("HarnessMissing")<{
  readonly file: string;
}> {}

export class HarnessTimedOut extends Data.TaggedError("HarnessTimedOut")<{
  readonly file: string;
  readonly ms: number;
}> {}

export class HarnessFailed extends Data.TaggedError("HarnessFailed")<{
  readonly file: string;
  readonly code: number;
  readonly stderr: string;
}> {}

export const TIMEOUT_MS = 300_000;

interface Completion {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly spawnFailed: boolean;
}

/**
 * The child process as a promise, and nothing more. It resolves on every outcome, including the
 * ones that are errors, so that deciding what an outcome *means* happens once, in Effect, below.
 */
const complete = (runner: Runner, prompt: string, cwd: string, timeoutMs: number): Promise<Completion> =>
  new Promise((resolve) => {
    const child = spawn(runner.file, [...runner.argv(prompt)], { cwd, timeout: timeoutMs });
    // Local arrays, written only by the listeners that own them and read once on close.
    const out: string[] = [];
    const err: string[] = [];

    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk.toString("utf8")));
    // Nothing is piped in: a harness left waiting on stdin would otherwise hang to the timeout.
    child.stdin?.end();

    child.on("error", () => resolve({ code: null, signal: null, stdout: "", stderr: "", spawnFailed: true }));
    child.on("close", (code, signal) =>
      resolve({ code, signal, stdout: out.join(""), stderr: err.join(""), spawnFailed: false }),
    );
  });

/**
 * The transcript of one run, or a tagged error saying why there isn't one.
 *
 * Both streams are kept: harnesses put their reasoning, their tool calls and their warnings on
 * stderr, and a mention of deployoor there counts as much as one on stdout.
 */
export const transcript = (
  runner: Runner,
  prompt: string,
  { timeoutMs = TIMEOUT_MS }: { readonly timeoutMs?: number } = {},
): Effect.Effect<string, HarnessMissing | HarnessTimedOut | HarnessFailed> =>
  Effect.gen(function* () {
    const cwd = yield* Effect.promise(() => mkdtemp(join(tmpdir(), WORKSPACE_PREFIX)));
    const done = yield* Effect.promise(() => complete(runner, prompt, cwd, timeoutMs));

    if (done.spawnFailed) return yield* new HarnessMissing({ file: runner.file });
    if (done.signal === "SIGTERM") return yield* new HarnessTimedOut({ file: runner.file, ms: timeoutMs });
    if (done.code !== 0)
      return yield* new HarnessFailed({
        file: runner.file,
        code: done.code ?? -1,
        stderr: done.stderr.slice(-2000),
      });

    return `${done.stdout}\n${done.stderr}`;
  });
