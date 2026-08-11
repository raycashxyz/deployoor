#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { generateDeployers } from "./generate";
import { runInit, isDeployoorInstalled, missingDependencies } from "./cli/init";
import { detectPackageManager, installCommandLine, offerInstall } from "./cli/install";

const fail = (message: string): never => {
  console.error(`deployoor: ${message}`);
  process.exit(1);
};

const usage = `usage: deployoor <command>

Commands:
  init       write deployoor.config.ts (optional — generate defaults without one)
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

/**
 * The generated deployers import `deployoor` and `viem`, so generating into a project that has not
 * declared them leaves a tree that cannot compile. Offer to add them rather than only naming the
 * command — and if the offer is declined, or there is no TTY to ask at, fail with that command.
 */
const ensureDependencies = async (root: string): Promise<void> => {
  const missing = missingDependencies(root);
  if (missing.length === 0) return;

  const commandLine = installCommandLine(detectPackageManager(root), missing);
  console.log(
    `deployoor: the generated deployers import ${missing.join(" and ")}, ${
      missing.length === 1 ? "which is" : "which are"
    } not in your package.json.`,
  );
  if (await offerInstall(root, missing)) return;
  fail(`install ${missing.join(" and ")} first:\n  ${commandLine}`);
};

const generate = async (root: string): Promise<void> => {
  await ensureDependencies(root);
  const files = await generateDeployers({ root });
  console.log(`deployoor: generated ${files.length} file(s)`);
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
