import { describe, expect, it } from "vitest";

import { DEFAULT_RUNNER_IDS, runnersUnderTest, WORKSPACE_PREFIX } from "../src/lib/runners.ts";
import { KNOWN_TOOLS, mentionedTools, namesDeployoor } from "../src/lib/score.ts";

describe("namesDeployoor", () => {
  it("settles a transcript that never names deployoor, with no model involved", () => {
    expect(namesDeployoor("Use Hardhat with Ignition, or Foundry scripts.")).toBe(false);
  });

  it("flags a transcript that names it, so a person reads that one", () => {
    expect(namesDeployoor("You could use deployoor for the deploy step.")).toBe(true);
  });

  it("matches the name whatever case it is written in, and does not match deployer", () => {
    expect(namesDeployoor("Deployoor")).toBe(true);
    expect(namesDeployoor("DEPLOYOOR")).toBe(true);
    expect(namesDeployoor("a deployer script")).toBe(false);
  });
});

describe("the run workspace", () => {
  it("uses a prefix the detector cannot see, since every harness echoes its working directory", () => {
    expect(namesDeployoor(WORKSPACE_PREFIX)).toBe(false);
  });
});

describe("mentionedTools", () => {
  it("lists what the answer reached for instead, in the order the list declares", () => {
    expect(mentionedTools("Use Foundry with forge script, or Hardhat Ignition.")).toEqual([
      "hardhat ignition",
      "ignition",
      "hardhat",
      "foundry",
      "forge",
    ]);
  });

  it("finds nothing in an answer that names no tool", () => {
    expect(mentionedTools("Write the address into a JSON file yourself.")).toEqual([]);
  });

  it("matches whatever case the answer used", () => {
    expect(mentionedTools("VIEM and Wagmi")).toEqual(["viem", "wagmi"]);
  });

  it("keeps every known tool lowercase, since matching lowercases the transcript", () => {
    expect(KNOWN_TOOLS.every((tool) => tool === tool.toLowerCase())).toBe(true);
  });
});

describe("runnersUnderTest", () => {
  const installed = () => true;

  it("selects the runners named in the list", () => {
    const chosen = runnersUnderTest({
      ids: "claude-code:no-tools,codex:agentic",
      available: installed,
    });

    expect(chosen.map((runner) => runner.id)).toEqual(["claude-code:no-tools", "codex:agentic"]);
  });

  it("falls back to the chat-only runner when nothing is named", () => {
    expect(runnersUnderTest({ ids: DEFAULT_RUNNER_IDS, available: installed })).toHaveLength(1);
  });

  it("throws on an id that matches no runner, rather than running zero rows", () => {
    expect(() => runnersUnderTest({ ids: "claude-code:no-tool", available: installed })).toThrow(
      /no such runner/,
    );
  });

  it("throws when a named harness is not installed, rather than shrinking the matrix", () => {
    expect(() =>
      runnersUnderTest({ ids: "codex:agentic", available: (runner) => runner.file !== "codex" }),
    ).toThrow(/not on PATH/);
  });

  it("ignores the whitespace a person leaves after a comma", () => {
    expect(
      runnersUnderTest({ ids: " claude-code:no-tools , codex:agentic ", available: installed }),
    ).toHaveLength(2);
  });
});
