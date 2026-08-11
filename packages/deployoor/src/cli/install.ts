import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

/**
 * Offer to install the packages the generated deployers need, when `deployoor generate` runs in a
 * project that has not added them yet.
 *
 * The deployers `import { defineDeployer } from "deployoor"`, so generating them into a project
 * without the dependency produces a tree that cannot compile. That used to be a bare error telling
 * you to run a command yourself; the command is short and unambiguous, so it is offered instead.
 *
 * Installing is a side effect on the user's project, so it only ever happens after an explicit "y"
 * at an interactive prompt. Without a TTY (CI, a piped run, an agent) there is nobody to ask, so the
 * caller falls back to the error.
 */

/** Package managers, keyed by the lockfile that identifies them, with their add-as-dev-dependency form. */
const LOCKFILES = [
  { lockfile: "pnpm-lock.yaml", command: "pnpm", args: ["add", "-D"] },
  { lockfile: "yarn.lock", command: "yarn", args: ["add", "-D"] },
  { lockfile: "bun.lockb", command: "bun", args: ["add", "-d"] },
  { lockfile: "bun.lock", command: "bun", args: ["add", "-d"] },
  { lockfile: "package-lock.json", command: "npm", args: ["install", "-D"] },
] as const;

export interface PackageManager {
  readonly command: string;
  readonly args: readonly string[];
}

const NPM: PackageManager = { command: "npm", args: ["install", "-D"] };

/**
 * Which package manager this project uses. Read from the lockfile rather than from
 * `npm_config_user_agent`, because the agent describes whoever spawned this process — `npx` in a
 * pnpm project reports npm — whereas the lockfile describes the project. Falls back to npm.
 */
export const detectPackageManager = (root: string): PackageManager => {
  const found = LOCKFILES.find((entry) => existsSync(join(root, entry.lockfile)));
  return found === undefined ? NPM : { command: found.command, args: found.args };
};

/** The command line a user would type, for printing in prompts and errors. */
export const installCommandLine = (pm: PackageManager, packages: readonly string[]): string =>
  [pm.command, ...pm.args, ...packages].join(" ");

export interface PromptDeps {
  /** Whether we can ask a question at all. Defaults to stdin being a TTY. */
  readonly isInteractive?: () => boolean;
  /** Asks the question, resolving to the raw answer. Defaults to a readline prompt on stdio. */
  readonly ask?: (question: string) => Promise<string>;
  /** Runs the install, resolving to whether it succeeded. Defaults to a stdio-inherited spawn. */
  readonly run?: (pm: PackageManager, packages: readonly string[]) => boolean;
  readonly log?: (message: string) => void;
}

const defaultAsk = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
};

const defaultRun = (pm: PackageManager, packages: readonly string[]): boolean =>
  spawnSync(pm.command, [...pm.args, ...packages], { stdio: "inherit", shell: process.platform === "win32" })
    .status === 0;

/**
 * Ask whether to install `packages`, and do it if the answer is yes. Resolves to whether they are
 * now installed. Anything other than y/yes — including a bare Enter — is a no, so the risky branch
 * needs a deliberate keystroke.
 */
export const offerInstall = async (
  root: string,
  packages: readonly string[],
  deps: PromptDeps = {},
): Promise<boolean> => {
  const isInteractive = deps.isInteractive ?? (() => process.stdin.isTTY === true);
  const log = deps.log ?? ((message: string) => console.log(message));
  const pm = detectPackageManager(root);
  const commandLine = installCommandLine(pm, packages);

  if (!isInteractive()) return false;

  const answer = await (deps.ask ?? defaultAsk)(`deployoor: run \`${commandLine}\` now? [y/N] `);
  if (!/^y(es)?$/i.test(answer.trim())) return false;

  log(`deployoor: ${commandLine}`);
  const ok = (deps.run ?? defaultRun)(pm, packages);
  if (!ok) log(`deployoor: \`${commandLine}\` failed — run it yourself, then retry.`);
  return ok;
};
