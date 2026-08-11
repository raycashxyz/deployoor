#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { generateDeployers } from "./generate";
import { loadConfig } from "./cli/config-file";
import { runInit, isDeployoorInstalled, missingDependencies } from "./cli/init";
import { detectPackageManager, installCommandLine, offerInstall } from "./cli/install";
import { reviewIgnoredOutput } from "./cli/gitignore";
import { parseVerifyArgs, runVerify, VERIFY_FLAG_HELP, VERIFY_USAGE, type VerifyResult } from "./cli/verify";

const fail = (message: string): never => {
  console.error(`deployoor: ${message}`);
  process.exit(1);
};

const usage = `usage: deployoor <command>

Commands:
  init       write deployoor.config.ts (optional — generate defaults without one)
  generate   read compiled artifacts and write typed deployers
  verify     verify recorded deployments on a block explorer (no recompile)

verify options:
${VERIFY_FLAG_HELP}

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
  // After writing, not before: the advice is about committing files that now exist, and the config is
  // read a second time here so that a `generate` failure never stops to ask about a `.gitignore`.
  const { config } = await loadConfig(root);
  await reviewIgnoredOutput(root, config);
};

/**
 * One indented block per record: the status, where it is, and — for anything that is not a clean
 * pass — why. The plugins stream their own progress lines as they go (`[etherscan] … verified`);
 * this is the authoritative summary printed once the run is over.
 */
const verifyLines = (result: VerifyResult): ReadonlyArray<string> => {
  const where = `${result.networkName}/${result.deploymentName} at ${result.address}`;
  const outcome = result.outcome;
  if (outcome.status === "verified") {
    return [`  verified      ${where} (${outcome.plugins.join(", ")})`];
  }
  if (outcome.status === "failed") {
    return [
      `  FAILED        ${where}`,
      ...outcome.failures.map((failure) => `                  ${failure.plugin}: ${failure.error}`),
    ];
  }
  const label = outcome.status === "unverifiable" ? "unverifiable" : "skipped     ";
  return [`  ${label}  ${where}`, `                  ${outcome.detail}`];
};

const countOf = (results: ReadonlyArray<VerifyResult>, status: VerifyResult["outcome"]["status"]): number =>
  results.filter((result) => result.outcome.status === status).length;

const verify = async (root: string, argv: ReadonlyArray<string>): Promise<void> => {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(VERIFY_USAGE);
    return;
  }
  const args = parseVerifyArgs(argv);
  const { config } = await loadConfig(root);
  const report = await runVerify({ root, config, ...args });

  console.log(`deployoor: checked ${report.results.length} record(s) through ${report.plugins.join(", ")}`);
  report.results.flatMap(verifyLines).forEach((line) => console.log(line));

  const counts = [
    `${countOf(report.results, "verified")} verified`,
    ...(countOf(report.results, "failed") === 0 ? [] : [`${countOf(report.results, "failed")} failed`]),
    ...(countOf(report.results, "unverifiable") === 0
      ? []
      : [`${countOf(report.results, "unverifiable")} unverifiable`]),
    ...(countOf(report.results, "skipped") === 0 ? [] : [`${countOf(report.results, "skipped")} skipped`]),
  ];
  console.log(`deployoor: ${counts.join(", ")}`);
  // Already reported per record, so this exits non-zero without a second error message.
  if (!report.ok) process.exitCode = 1;
};

const init = async (root: string): Promise<void> => {
  const { configPath, created } = await runInit(root);
  console.log(created ? `deployoor: created ${configPath}` : `deployoor: ${configPath} already exists`);
  // The scaffold has just declared where the output goes, so this is the moment a rule ignoring it is
  // both discoverable and cheap to fix — before anything has been generated or deployed.
  const { config } = await loadConfig(root);
  await reviewIgnoredOutput(root, config);
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
  if (command === "verify") return verify(root, process.argv.slice(3));
  fail(`unknown command "${command}"\n${usage}`);
};

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
