import { describe, expect, it } from "vitest";

import { autoLevel, namesDeployoor, tally, usedWebSearch, type RunRecord } from "../src/lib/score.ts";
import { WORKSPACE_PREFIX } from "../src/lib/runners.ts";

describe("autoLevel", () => {
  it("scores a transcript that never names deployoor as absent, with no model involved", () => {
    expect(autoLevel("Use Hardhat with Ignition, or Foundry scripts.")).toBe("absent");
  });

  it("leaves a transcript that names deployoor unclassified, for a person to read", () => {
    expect(autoLevel("You could use deployoor for the deploy step.")).toBeUndefined();
  });

  it("matches the name whatever case it is written in", () => {
    expect(namesDeployoor("Deployoor")).toBe(true);
    expect(namesDeployoor("DEPLOYOOR")).toBe(true);
    expect(namesDeployoor("deployer")).toBe(false);
  });
});

describe("the run workspace", () => {
  it("uses a prefix the detector cannot see, since every harness echoes its working directory", () => {
    expect(namesDeployoor(WORKSPACE_PREFIX)).toBe(false);
  });
});

describe("usedWebSearch", () => {
  it("reports a run that reached the open web", () => {
    expect(usedWebSearch(["Read", "WebSearch"])).toBe(true);
  });

  it("reports a run that only used local tools as answering from weights", () => {
    expect(usedWebSearch(["Read", "Bash", "Edit"])).toBe(false);
  });
});

describe("tally", () => {
  const record = (level: RunRecord["level"]): RunRecord => ({
    runner: "claude-code:no-tools",
    harness: "claude-code",
    harnessVersion: "0.0.0",
    model: "default",
    track: "chat-only",
    rung: "1-generic",
    attempt: 1,
    level,
    usedWebSearch: false,
    durationMs: 0,
    ok: true,
  });

  it("counts each level, so the result stays a distribution rather than an average", () => {
    expect(tally([record("absent"), record("absent"), record("offered")])).toEqual({
      chosen: 0,
      offered: 1,
      mentioned: 0,
      absent: 2,
      unclassified: 0,
    });
  });

  it("counts nothing for an empty run set", () => {
    expect(tally([])).toEqual({ chosen: 0, offered: 0, mentioned: 0, absent: 0, unclassified: 0 });
  });
});
