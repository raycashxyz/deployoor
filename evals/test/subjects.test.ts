import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { BASELINE_MODELS, MODELS, SMOKE_MODELS } from "../src/lib/models.ts";
import { namesDeployoor } from "../src/lib/score.ts";
import type { Runner } from "../src/lib/runners.ts";
import { FIXTURE_ID } from "../src/lib/fixture.ts";
import { ALL_SUBJECTS, ask, DEFAULT_SUBJECT_IDS, subjectsUnderTest } from "../src/lib/subjects.ts";

const installed = (_runner: Runner) => true;
const key = "test-key";

describe("ALL_SUBJECTS", () => {
  it("offers every model on the chat-only track and every CLI on the agentic one", () => {
    const models = ALL_SUBJECTS.filter((subject) => subject.kind === "model");
    const clis = ALL_SUBJECTS.filter((subject) => subject.kind === "cli");

    expect(models.map((subject) => subject.id)).toEqual([...MODELS]);
    expect(models.every((subject) => subject.track === "chat-only")).toBe(true);
    expect(clis.every((subject) => subject.track === "agentic")).toBe(true);
  });

  it("gives every subject a distinct id, since selection matches on it", () => {
    const ids = ALL_SUBJECTS.map((subject) => subject.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("subjectsUnderTest", () => {
  it("defaults to the baseline models, not the cheap ones", () => {
    const chosen = subjectsUnderTest({ ids: DEFAULT_SUBJECT_IDS, available: installed, apiKey: key });

    expect(chosen.map((subject) => subject.id)).toEqual([...BASELINE_MODELS]);
  });

  it("can select the smoke models, which are selectable but never the default", () => {
    const chosen = subjectsUnderTest({
      ids: SMOKE_MODELS.join(","),
      available: installed,
      apiKey: key,
    });

    expect(chosen.map((subject) => subject.id)).toEqual([...SMOKE_MODELS]);
    expect(SMOKE_MODELS.some((id) => BASELINE_MODELS.includes(id as never))).toBe(false);
  });

  it("selects a mix of models and CLIs when asked for both", () => {
    const chosen = subjectsUnderTest({
      ids: `${MODELS[0]},codex:agentic`,
      available: installed,
      apiKey: key,
    });

    expect(chosen.map((subject) => subject.kind)).toEqual(["model", "cli"]);
  });

  it("throws on an id that matches nothing, rather than running zero rows", () => {
    expect(() =>
      subjectsUnderTest({ ids: "anthropic/claude-sonnet-99", available: installed, apiKey: key }),
    ).toThrow(/names nothing known/);
  });

  it("throws when a named CLI is not installed, rather than shrinking the matrix", () => {
    expect(() => subjectsUnderTest({ ids: "codex:agentic", available: () => false, apiKey: key })).toThrow(
      /not on PATH/,
    );
  });

  it("throws once when models are asked for without a key, rather than once per row", () => {
    expect(() => subjectsUnderTest({ ids: MODELS[0], available: installed, apiKey: undefined })).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });

  it("needs neither a key nor a binary for the fixture, which is the point of it", () => {
    expect(subjectsUnderTest({ ids: FIXTURE_ID, available: () => false, apiKey: undefined })).toHaveLength(1);
  });

  it("needs no key for a CLI-only run", () => {
    expect(subjectsUnderTest({ ids: "codex:agentic", available: installed, apiKey: undefined })).toHaveLength(
      1,
    );
  });

  it("ignores the whitespace a person leaves after a comma", () => {
    expect(
      subjectsUnderTest({
        ids: ` ${MODELS[0]} , codex:agentic `,
        available: installed,
        apiKey: key,
      }),
    ).toHaveLength(2);
  });
});

describe("the fixture subject", () => {
  const fixture = ALL_SUBJECTS.find((subject) => subject.kind === "fixture");

  it("exists, so a run can exercise the harness without spending anything", () => {
    expect(fixture).toBeDefined();
  });

  it("answers every rung without a key, a binary or a network call", async () => {
    if (!fixture) throw new Error("no fixture subject");
    const said = await Effect.runPromise(ask(fixture, "ignored", "1-generic"));

    expect(said).toContain("Hardhat");
  });

  it("names deployoor on one rung, so the score-1 branch is exercised somewhere", async () => {
    if (!fixture) throw new Error("no fixture subject");
    const hit = await Effect.runPromise(ask(fixture, "ignored", "5-idempotent-deploy"));
    const miss = await Effect.runPromise(ask(fixture, "ignored", "1-generic"));

    expect(namesDeployoor(hit)).toBe(true);
    expect(namesDeployoor(miss)).toBe(false);
  });
});
