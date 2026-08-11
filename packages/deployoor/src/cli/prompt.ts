import { createInterface } from "node:readline/promises";

/**
 * Asking the user a yes/no question before doing something to their project.
 *
 * Two commands need this — offering to install the packages the deployers import, and offering to
 * remove a `.gitignore` rule that would stop them being committed — and both have the same two rules:
 * only an explicit "y" proceeds, and with no TTY there is nobody to ask, so the answer is no. Keeping
 * one implementation means a change to either rule cannot apply to one prompt and not the other.
 */

export interface ConfirmDeps {
  /** Whether we can ask a question at all. Defaults to stdin being a TTY. */
  readonly isInteractive?: () => boolean;
  /** Asks the question, resolving to the raw answer. Defaults to a readline prompt on stdio. */
  readonly ask?: (question: string) => Promise<string>;
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

/**
 * Ask `question`, resolving to whether the answer was yes. Anything other than y/yes — including a
 * bare Enter — is a no, so the branch with a side effect needs a deliberate keystroke.
 *
 * Resolves to `false` without asking when there is no TTY (CI, a piped run, an agent), so an
 * unattended run never changes the project.
 */
export const confirm = async (question: string, deps: ConfirmDeps = {}): Promise<boolean> => {
  const isInteractive = deps.isInteractive ?? (() => process.stdin.isTTY === true);
  if (!isInteractive()) return false;

  const answer = await (deps.ask ?? defaultAsk)(question);
  return /^y(es)?$/i.test(answer.trim());
};

/** Where a prompt's own progress lines go. */
export const loggerFor = (deps: ConfirmDeps): ((message: string) => void) =>
  deps.log ?? ((message: string) => console.log(message));
