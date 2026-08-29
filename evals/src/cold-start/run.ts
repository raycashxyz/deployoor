/**
 * Runs the cold-start ladder and writes the raw transcripts plus a summary.
 *
 * Every run happens in a throwaway directory, so an agentic harness that decides to scaffold
 * something writes it somewhere harmless rather than into this repo.
 *
 * Usage, from `evals/`:
 *   node src/cold-start/run.ts --out <dir> [--attempts 5] [--runner <id>]...
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { RUNGS, type Rung } from "./prompts.ts";
import { autoLevel, tally, type RunRecord } from "../lib/score.ts";
import { isAvailable, probeVersion, RUNNERS, WORKSPACE_PREFIX, type Runner } from "../lib/runners.ts";

const flag = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
};

const flagAll = (name: string): readonly string[] =>
  process.argv.flatMap((argument, index) =>
    argument === `--${name}` ? [process.argv[index + 1] ?? ""] : [],
  );

/** Sequential rather than concurrent: these hit rate-limited harnesses on one developer's account. */
const sequential = async <T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<readonly R[]> =>
  items.reduce<Promise<R[]>>(
    async (accumulated, item) => [...(await accumulated), await run(item)],
    Promise.resolve([]),
  );

interface Cell {
  readonly runner: Runner;
  readonly rung: Rung;
  readonly attempt: number;
}

const runCell = (cell: Cell, version: string, outDir: string): RunRecord => {
  const workspace = mkdtempSync(join(tmpdir(), WORKSPACE_PREFIX));
  const startedAt = Date.now();
  const result = spawnSync(cell.runner.file, [...cell.runner.argv(cell.rung.prompt)], {
    cwd: workspace,
    encoding: "utf8",
    input: "",
    timeout: 300_000,
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;
  const transcript = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const level = autoLevel(transcript) ?? "unclassified";

  writeFileSync(
    join(outDir, "runs", `${cell.runner.id.replace(":", "_")}--${cell.rung.id}--${cell.attempt}.json`),
    `${JSON.stringify(
      { cell: { runner: cell.runner.id, rung: cell.rung.id, attempt: cell.attempt }, transcript },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    runner: cell.runner.id,
    harness: cell.runner.harness,
    harnessVersion: version,
    model: cell.runner.model,
    track: cell.runner.track,
    rung: cell.rung.id,
    attempt: cell.attempt,
    level,
    // Tools are off on the chat-only track by construction; an agentic run is classified by hand
    // alongside its level, from the transcript this writes out.
    usedWebSearch: false,
    durationMs,
    ok: result.status === 0,
  };
};

const main = async (): Promise<void> => {
  const outDir = flag("out", join(process.cwd(), "results", new Date().toISOString().slice(0, 10)));
  const attempts = Number(flag("attempts", "5"));
  const only = flagAll("runner");
  const selected = RUNNERS.filter(
    (runner) => (only.length === 0 || only.includes(runner.id)) && isAvailable(runner),
  );

  if (selected.length === 0) throw new Error("cold-start: no runner available on this machine");

  mkdirSync(join(outDir, "runs"), { recursive: true });
  const versions = new Map(selected.map((runner) => [runner.id, probeVersion(runner)]));

  const cells: readonly Cell[] = selected.flatMap((runner) =>
    RUNGS.flatMap((rung) =>
      Array.from({ length: attempts }, (_, index) => ({ runner, rung, attempt: index + 1 })),
    ),
  );

  console.log(`cold-start: ${cells.length} runs across ${selected.length} runner(s) → ${outDir}`);

  const records = await sequential(cells, async (cell) => {
    const record = runCell(cell, versions.get(cell.runner.id) ?? "unknown", outDir);
    console.log(
      `  ${record.runner} ${record.rung} #${record.attempt}: ${record.level} (${Math.round(record.durationMs / 1000)}s)`,
    );
    return record;
  });

  const byRung = RUNGS.map((rung) => ({
    rung: rung.id,
    byRunner: selected.map((runner) => ({
      runner: runner.id,
      ...tally(records.filter((record) => record.rung === rung.id && record.runner === runner.id)),
    })),
  }));

  writeFileSync(
    join(outDir, "summary.json"),
    `${JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        node: process.version,
        harnesses: selected.map((runner) => ({
          id: runner.id,
          harness: runner.harness,
          version: versions.get(runner.id),
          track: runner.track,
        })),
        attempts,
        byRung,
        records,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`cold-start: wrote ${join(outDir, "summary.json")}`);
};

await main();
