import { defineConfig } from "evalite/config";

/**
 * Evals here either call a model over HTTP or shell out to a coding-agent CLI, and both think for
 * far longer than a unit test.
 *
 * Without the timeout, vitest's 30s default kills the row and evalite reports a failed eval. That
 * failure is worse than it looks: a killed row has no answer, so it neither scores nor tells you
 * anything, and a rung that reliably times out silently drops out of the ladder. The subject has its
 * own budget per run, and this leaves vitest a little more, so the tagged error is what surfaces
 * rather than the runner being shot from underneath it.
 *
 * Concurrency defaults to four, which suits the model track: those are independent HTTP calls to
 * different providers. Drop it to one for a CLI-heavy run, since those share a single local account
 * and its rate limit: `EVAL_CONCURRENCY=1 pnpm eval`.
 */
export default defineConfig({
  testTimeout: 330_000,
  maxConcurrency: Number(process.env.EVAL_CONCURRENCY ?? "4"),
});
