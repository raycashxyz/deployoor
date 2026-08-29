import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";

import { HarnessFailed, HarnessMissing, HarnessTimedOut, transcript } from "../src/lib/harness.ts";
import type { Runner } from "../src/lib/runners.ts";

/**
 * Deterministic stand-ins for a coding-agent CLI. `node -e` is the one binary this repo can rely on
 * being present, on every platform CI runs.
 */
const fake = (script: string, file = "node"): Runner => ({
  id: "fake",
  harness: "fake",
  model: "none",
  track: "chat-only",
  file,
  argv: () => ["-e", script],
  versionArgv: ["--version"],
});

/** Runs the effect once and hands back the tagged error it failed with. */
const failureOf = async <E>(effect: Effect.Effect<string, E>): Promise<E> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error(`expected a failure, got: ${exit.value.slice(0, 80)}`);

  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure))
    throw new Error(`expected a tagged failure, got a defect: ${Cause.pretty(exit.cause)}`);

  return failure.value;
};

describe("transcript", () => {
  it("returns what the harness said on both streams, since a mention on stderr still counts", async () => {
    const said = await Effect.runPromise(
      transcript(fake("console.log('on stdout'); console.error('on stderr')"), "prompt"),
    );

    expect(said).toContain("on stdout");
    expect(said).toContain("on stderr");
  });

  it("fails with HarnessMissing when the binary is not on PATH", async () => {
    const error = await failureOf(transcript(fake("", "definitely-not-a-real-binary"), "prompt"));

    expect(error).toBeInstanceOf(HarnessMissing);
    expect((error as HarnessMissing).file).toBe("definitely-not-a-real-binary");
  });

  it("fails with HarnessFailed when the harness exits non-zero, keeping its stderr", async () => {
    const error = await failureOf(transcript(fake("console.error('it broke'); process.exit(3)"), "prompt"));

    expect(error).toBeInstanceOf(HarnessFailed);
    expect((error as HarnessFailed).code).toBe(3);
    expect((error as HarnessFailed).stderr).toContain("it broke");
  });

  it("fails with HarnessTimedOut rather than returning a truncated transcript", async () => {
    const error = await failureOf(
      transcript(fake("setTimeout(() => {}, 10_000)"), "prompt", { timeoutMs: 200 }),
    );

    expect(error).toBeInstanceOf(HarnessTimedOut);
    expect((error as HarnessTimedOut).ms).toBe(200);
  });

  it("tells a timeout apart from an empty answer, which is the whole reason these are tagged", async () => {
    const empty = await Effect.runPromise(transcript(fake("process.stdout.write('')"), "prompt"));
    const timedOut = await failureOf(
      transcript(fake("setTimeout(() => {}, 10_000)"), "prompt", { timeoutMs: 200 }),
    );

    expect(empty.trim()).toBe("");
    expect(timedOut).toBeInstanceOf(HarnessTimedOut);
  });
});
