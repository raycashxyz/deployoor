import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Config } from "../config";
import { confirm, loggerFor, type ConfirmDeps } from "./prompt";

/**
 * Notice a `.gitignore` rule that would stop deployoor's output from being committed, and offer to
 * remove it.
 *
 * Everything deployoor writes is meant to be committed. `deployments/` is the record every consumer
 * reads, and since the deployers stopped inlining `standardJsonInput` they are small enough to diff
 * and needed for a fresh clone to typecheck without anyone knowing to run `generate` first. The docs
 * used to say the opposite, so the projects most likely to carry such a rule are the ones that
 * followed them — including every example in this repo.
 *
 * The question is answered by `git check-ignore`, not by parsing `.gitignore` here. Git honours
 * nested ignore files, `.git/info/exclude`, `core.excludesFile`, and negations; a hand-rolled parser
 * gets those wrong, and getting them wrong means either nagging about a rule the user already
 * overrode with `!deployers/`, or editing a file that was not the one deciding the outcome.
 * `check-ignore -v` also names the file, line and pattern that won, which is what makes a removal
 * precise rather than a search-and-replace.
 *
 * Nothing here runs from `generateDeployers`, only from the CLI. The programmatic path is what
 * `@deployoor/hardhat` calls on every `hardhat compile`, and a build hook is the wrong place both to
 * ask a question and to print the same advice on every build.
 */

/** A rule that ignores something deployoor generates. */
export interface IgnoredOutput {
  /** Root-relative directory, with the trailing slash `check-ignore` was asked about. */
  readonly path: string;
  /** Why committing it matters, for the message. */
  readonly why: string;
  /** Absolute path of the file holding the rule. */
  readonly source: string;
  /** The same file as `git` printed it — relative to the project, so it reads like the user's own path. */
  readonly sourceLabel: string;
  /** 1-based line within `source`. */
  readonly line: number;
  /** The pattern as written. */
  readonly pattern: string;
  /**
   * Whether the pattern names this directory and nothing else. A rule like `build` that happens to
   * cover `build/deployers` must not be removed on deployoor's say-so — it is the user's rule about
   * their own directory, and dropping it would un-ignore everything else under it.
   */
  readonly targeted: boolean;
  /**
   * Whether `source` is a file inside the project. A global `core.excludesFile` or
   * `.git/info/exclude` is reported but never edited: it is machine- or clone-wide, so the blast
   * radius of a wrong guess is bigger than the problem being fixed.
   */
  readonly editable: boolean;
}

/** What deployoor writes, and why it is meant to be in the repo. */
const OUTPUTS = [
  {
    path: (config: Config) => config.out ?? "./deployers",
    why: "the generated deployers, which a fresh clone cannot typecheck or deploy without",
  },
  {
    path: (config: Config) => config.deploymentsPath ?? "./deployments",
    why: "the deployment record, which your app, @wagmi/cli and `deployoor verify` all read",
  },
] as const;

export interface GitignoreDeps extends ConfirmDeps {
  /**
   * Runs `git check-ignore` and returns its stdout, or undefined when git cannot answer (no binary,
   * not a repository). Injected so tests can drive the parser without a repository, though the ones
   * that matter use a real `git init` — the behaviour being relied on here is git's.
   */
  readonly checkIgnore?: (root: string, paths: readonly string[]) => string | undefined;
}

/**
 * Ask git which of `paths` are ignored, in one call.
 *
 * Exit 0 means at least one match and stdout holds them; 1 means none, which is the common case and
 * not an error; anything else (128 outside a repository, a missing binary) means git cannot answer,
 * and an unanswerable question is reported as silence rather than as a guess.
 */
const defaultCheckIgnore = (root: string, paths: readonly string[]): string | undefined => {
  const result = spawnSync("git", ["check-ignore", "-v", "--no-index", "--", ...paths], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error !== undefined) return undefined;
  if (result.status === 0) return result.stdout;
  return result.status === 1 ? "" : undefined;
};

/**
 * `<source>:<line>:<pattern>\t<path>`, split from the right so a pattern containing a colon stays
 * intact, and non-greedily on the left so a Windows drive letter is not mistaken for the line number.
 */
const LINE = /^(.*?):(\d+):(.*)$/;

const parseEntry = (
  root: string,
  outputs: ReadonlyMap<string, string>,
  raw: string,
): IgnoredOutput | undefined => {
  const tab = raw.lastIndexOf("\t");
  if (tab === -1) return undefined;
  const why = outputs.get(raw.slice(tab + 1));
  const parsed = LINE.exec(raw.slice(0, tab));
  const [, sourceLabel, lineNumber, pattern] = parsed ?? [];
  if (why === undefined || sourceLabel === undefined || lineNumber === undefined || pattern === undefined)
    return undefined;

  const source = resolve(root, sourceLabel);
  return {
    path: raw.slice(tab + 1),
    why,
    source,
    sourceLabel,
    line: Number(lineNumber),
    pattern,
    targeted: isTargeted(pattern, raw.slice(tab + 1)),
    editable: isInsideProject(root, source),
  };
};

/**
 * The path with every symlink resolved, or the path itself when it cannot be resolved.
 *
 * Total on purpose: `realpathSync` throws for something that does not exist, and "is this inside the
 * project" still has a sensible lexical answer then.
 */
const canonical = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * Whether `source` is a file this may edit: inside `root`, and not inside `.git`.
 *
 * Compared on **canonical** paths, not lexical ones. Git does not follow a symlinked `.gitignore`,
 * but it does follow one used as `core.excludesFile` — so a link sitting inside the project can name
 * a target outside it, and a lexical comparison would call that editable and then write through the
 * link to a file somewhere else entirely.
 */
const isInsideProject = (root: string, source: string): boolean => {
  const segments = relative(canonical(root), canonical(source)).split(/[\\/]/);
  return segments[0] !== ".." && !segments.includes(".git");
};

/** A pattern with the anchoring and directory markers taken off, so it can be compared to a path. */
const bare = (pattern: string): string => pattern.replace(/^\//, "").replace(/\/$/, "");

const isTargeted = (pattern: string, path: string): boolean => {
  const target = bare(path);
  const segments = target.split("/");
  return bare(pattern) === target || bare(pattern) === segments[segments.length - 1];
};

/** A root-relative directory with a trailing slash, or undefined when it is not inside the project. */
const asQuery = (root: string, path: string): string | undefined => {
  const rel = relative(root, resolve(root, path)).replace(/\\/g, "/");
  // A directory that is not under `root` — `out: "../shared/deployers"` — is outside what git is
  // being asked about here, and `check-ignore` refuses paths beyond the repository anyway.
  return rel === "" || rel.startsWith("..") ? undefined : `${rel}/`;
};

/**
 * Which of deployoor's output directories are ignored.
 *
 * The trailing slash on each query is load-bearing: it tells git the path is a directory, without
 * which a directory-only pattern (`deployers/`) does not match a directory that has not been created
 * yet — so the check would pass before the first `generate` and fail after it.
 */
export const findIgnoredOutput = (
  root: string,
  config: Config,
  deps: GitignoreDeps = {},
): ReadonlyArray<IgnoredOutput> => {
  const outputs = new Map(
    OUTPUTS.flatMap((output) => {
      const query = asQuery(root, output.path(config));
      return query === undefined ? [] : [[query, output.why] as const];
    }),
  );
  if (outputs.size === 0) return [];

  const stdout = (deps.checkIgnore ?? defaultCheckIgnore)(root, [...outputs.keys()]);
  if (stdout === undefined || stdout.trim() === "") return [];

  return stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const entry = parseEntry(root, outputs, line);
      return entry === undefined ? [] : [entry];
    });
};

/**
 * The contiguous run of comment lines directly above `index` that mention deployoor, nearest first.
 *
 * Removing `deployers` while leaving `# generated by deployoor generate` above it leaves a comment
 * about a rule that is gone. Only comments naming deployoor are taken, so an unrelated one keeps
 * whatever it was describing.
 */
const ownComments = (lines: ReadonlyArray<string>, index: number): ReadonlyArray<number> => {
  const above = index - 1;
  const text = above < 0 ? undefined : lines[above];
  if (text === undefined || !text.trim().startsWith("#") || !/deployoor/i.test(text)) return [];
  return [above, ...ownComments(lines, above)];
};

/**
 * Drop each rule's line, and any deployoor comment introducing it, from the files that hold them.
 *
 * Every line for one file goes in a single rewrite: removing them one at a time would shift the
 * line numbers of the rules not yet removed, and delete the wrong line on the second pass.
 *
 * Split on `"\n"` and rejoined the same way, so CRLF endings (the `\r` stays on its line) and the
 * presence or absence of a trailing newline both survive untouched. Returns the rules it removed —
 * a line whose content no longer matches the pattern is left alone, since the file changed after git
 * read it and this is no longer the rule that was reported.
 */
export const removeIgnoreRules = (rules: ReadonlyArray<IgnoredOutput>): ReadonlyArray<IgnoredOutput> => {
  const bySource = rules.reduce<ReadonlyMap<string, ReadonlyArray<IgnoredOutput>>>(
    (acc, rule) => new Map(acc).set(rule.source, [...(acc.get(rule.source) ?? []), rule]),
    new Map(),
  );

  return [...bySource].flatMap(([source, forFile]) => {
    const lines = readFileSync(source, "utf8").split("\n");
    const removable = forFile.filter((rule) => lines[rule.line - 1]?.trim() === rule.pattern.trim());
    if (removable.length === 0) return [];

    const drop = new Set(removable.flatMap((rule) => [rule.line - 1, ...ownComments(lines, rule.line - 1)]));
    writeFileSync(source, lines.filter((_, index) => !drop.has(index)).join("\n"));
    return removable;
  });
};

/** The sentence a rule gets in the report, and the reason it cannot be removed where that applies. */
const describe = (rule: IgnoredOutput): ReadonlyArray<string> => {
  const head = `  ${rule.sourceLabel}:${rule.line} (\`${rule.pattern}\`) ignores ${rule.path} — ${rule.why}`;
  if (!rule.editable) {
    return [head, `    that file is outside the project, so it is left alone — remove the rule yourself`];
  }
  if (!rule.targeted) {
    // Not `!<path>` on its own: git does not descend into an excluded directory, so a negation for
    // something inside one has no effect. Widening the parent to `<dir>/*` is what makes it work.
    const parent = bare(rule.pattern);
    return [
      head,
      `    that pattern covers more than deployoor's output, so it is left alone — point \`out\` outside \`${parent}\`,`,
      `    or widen the rule to \`${parent}/*\` and add \`!${rule.path}\` after it (git ignores a negation inside an excluded directory)`,
    ];
  }
  return [head];
};

/**
 * Report any rule that would keep deployoor's output out of the repo, and offer to remove the ones
 * that name it. Resolves to what was removed.
 *
 * Only an explicit "y" edits a file, and with no TTY nothing is asked and nothing changes — so a CI
 * run reports the problem and leaves the repository as it found it.
 */
export const reviewIgnoredOutput = async (
  root: string,
  config: Config,
  deps: GitignoreDeps = {},
): Promise<ReadonlyArray<IgnoredOutput>> => {
  const found = findIgnoredOutput(root, config, deps);
  if (found.length === 0) return [];

  const log = loggerFor(deps);
  log("deployoor: git is ignoring output that is meant to be committed:");
  found.flatMap(describe).forEach(log);

  const removable = found.filter((rule) => rule.editable && rule.targeted);
  if (removable.length === 0) return [];

  const what =
    removable.length === 1
      ? `line ${removable[0]?.line} of ${removable[0]?.sourceLabel}`
      : `${removable.length} lines`;
  if (!(await confirm(`deployoor: remove ${what} now? [y/N] `, deps))) return [];

  const removed = removeIgnoreRules(removable);
  removed.forEach((rule) => log(`deployoor: removed \`${rule.pattern}\` from ${rule.sourceLabel}`));
  if (removed.length < removable.length) {
    log("deployoor: some rules changed on disk since they were read, and were left alone");
  }
  return removed;
};
