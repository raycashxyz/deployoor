#!/usr/bin/env node
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { runGenerate } from "./cli/generate";
import { runInit, isDeployoorInstalled } from "./cli/init";
import type { Config } from "./config";

const CONFIG_NAMES = ["deployoor.config.ts", "deployoor.config.js", "deployoor.config.mjs"];
const fail = (message: string): never => {
  console.error(`deployoor: ${message}`);
  process.exit(1);
};

const usage = `usage: deployoor <command>

Commands:
  init       write deployoor.config.ts
  generate   read compiled artifacts and write typed deployers

Options:
  -h, --help     show this help
  -v, --version  show deployoor version`;

const version = (): string => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version?: string;
  };
  return pkg.version ?? "0.0.0";
};

const generate = async (root: string): Promise<void> => {
  if (!isDeployoorInstalled(root)) {
    fail(
      "`deployoor` is not in your package.json — generated deployers import it.\n  Add it with `pnpm add -D deployoor viem`, then compile (`forge build` or `npx hardhat compile`) and run `npx deployoor generate`.",
    );
  }
  const configPath = CONFIG_NAMES.map((name) => join(root, name)).find((p) => existsSync(p));
  if (configPath === undefined) return fail("no deployoor.config found. Run `npx deployoor init` first.");

  const config = (await createJiti(import.meta.url).import(configPath, { default: true })) as Config;
  const out = resolve(root, config.out ?? "./deployers");
  const files = runGenerate({ root, out, configPath, include: config.include });
  console.log(`deployoor: generated ${files.length} file(s) → ${out}`);
};

const init = (root: string): void => {
  const { configPath, created } = runInit(root);
  console.log(created ? `deployoor: created ${configPath}` : `deployoor: ${configPath} already exists`);
  if (!isDeployoorInstalled(root))
    console.log("  next: add deployoor and viem → `pnpm add -D deployoor viem`");
  console.log("  next: compile contracts → `forge build` or `npx hardhat compile`");
  console.log("  next: generate deployers → `npx deployoor generate`");
};

const main = async (): Promise<void> => {
  const root = process.cwd();
  const command = process.argv[2];
  if (command === undefined || command === "-h" || command === "--help") {
    console.log(usage);
    return;
  }
  if (command === "-v" || command === "--version") {
    console.log(version());
    return;
  }
  if (command === "generate") return generate(root);
  if (command === "init") return init(root);
  fail(`unknown command "${command}"\n${usage}`);
};

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
