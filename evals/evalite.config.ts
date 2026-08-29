import { defineConfig } from "evalite/config";

/**
 * Evals here shell out to coding-agent CLIs, which think for far longer than a unit test.
 *
 * Without this, vitest's 30s default kills the row and evalite reports it as a failed eval. That
 * failure is worse than it looks: a killed run has no transcript, so it neither scores nor tells
 * you anything, and a rung that reliably times out silently drops out of the ladder. The harness
 * has its own 300s budget per run; this leaves vitest a little more than that so the tagged
 * `HarnessTimedOut` is what surfaces, rather than the runner being shot from underneath it.
 *
 * Serial, too: these hit rate-limited accounts, and parallel rows would race for the same quota.
 */
export default defineConfig({
  testTimeout: 330_000,
  maxConcurrency: 1,
});
