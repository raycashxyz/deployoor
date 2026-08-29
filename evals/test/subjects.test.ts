import { describe, expect, it } from "vitest";

import { MODELS } from "../src/lib/models.ts";
import type { Runner } from "../src/lib/runners.ts";
import { ALL_SUBJECTS, DEFAULT_SUBJECT_IDS, subjectsUnderTest } from "../src/lib/subjects.ts";

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
  it("defaults to the models, which are the headline track", () => {
    const chosen = subjectsUnderTest({ ids: DEFAULT_SUBJECT_IDS, available: installed, apiKey: key });

    expect(chosen).toHaveLength(MODELS.length);
    expect(chosen.every((subject) => subject.kind === "model")).toBe(true);
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
