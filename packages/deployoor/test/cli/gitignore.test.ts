import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findIgnoredOutput,
  removeIgnoreRules,
  reviewIgnoredOutput,
  type IgnoredOutput,
} from "../../src/cli/gitignore";
import type { Config } from "../../src/config";

/**
 * These run against a real `git init`, not a stubbed `check-ignore`.
 *
 * The whole reason the implementation shells out to git is that git's answer accounts for negations,
 * nested ignore files and `.git/info/exclude`, which a parser here would get wrong — so a test that
 * stubs git out would be asserting the parsing of an answer nobody produced. `git` is present
 * wherever this repo is checked out, and `init` in a temp directory costs a few milliseconds.
 */
const repo = (gitignore: string, extra: (root: string) => void = () => {}): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-gitignore-"));
  // -c: a machine with no user.name/user.email configured must not fail here, and no commit is made
  // anyway. `--initial-branch` keeps git from printing its default-branch advice onto the test output.
  const init = spawnSync("git", ["init", "-q", "--initial-branch=main", "."], { cwd: root });
  if (init.status !== 0) throw new Error(`git init failed in ${root}`);
  writeFileSync(join(root, ".gitignore"), gitignore);
  extra(root);
  return root;
};

const DEFAULTS: Config = {};

describe("findIgnoredOutput", () => {
  it("finds a rule ignoring the deployers, naming the file, line and pattern", () => {
    const root = repo("node_modules\ndeployers\n");

    const [found, ...rest] = findIgnoredOutput(root, DEFAULTS);

    expect(rest).toEqual([]);
    expect(found).toMatchObject({
      path: "deployers/",
      sourceLabel: ".gitignore",
      line: 2,
      pattern: "deployers",
      targeted: true,
      editable: true,
    });
  });

  it("finds the deployments rule too, which matters more than the deployers one", () => {
    const root = repo("deployments/\n");

    const found = findIgnoredOutput(root, DEFAULTS);

    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe("deployments/");
    expect(found[0]?.why).toContain("deployoor verify" as string);
  });

  it("says nothing when neither directory is ignored", () => {
    const root = repo("node_modules\ndist\n");

    expect(findIgnoredOutput(root, DEFAULTS)).toEqual([]);
  });

  it("matches a directory-only pattern before the directory exists", () => {
    // The trailing slash on the query is what makes this work: git cannot tell `deployers` is a
    // directory from the filesystem here, so without it `deployers/` would not match and the check
    // would pass before the first generate and only start failing after it.
    const root = repo("deployers/\n");

    expect(findIgnoredOutput(root, DEFAULTS)).toHaveLength(1);
  });

  it("respects a negation that puts the directory back", () => {
    // A user who already un-ignored the folder has answered the question, and must not be asked again.
    const root = repo("deployers/\n!deployers/\n");

    expect(findIgnoredOutput(root, DEFAULTS)).toEqual([]);
  });

  it("checks the configured paths, not the literal names", () => {
    const root = repo("generated\nrecords\ndeployers\ndeployments\n");

    const found = findIgnoredOutput(root, { out: "./generated", deploymentsPath: "./records" });

    expect(found.map((rule) => rule.pattern).sort()).toEqual(["generated", "records"]);
  });

  it("reads a rule from a nested ignore file, which only git knows about", () => {
    const root = repo("node_modules\n", (dir) => {
      mkdirSync(join(dir, "deployers"), { recursive: true });
      writeFileSync(join(dir, "deployers", ".gitignore"), "*\n");
    });

    const found = findIgnoredOutput(root, DEFAULTS);

    expect(found).toHaveLength(1);
    // A forward slash, not `join`: `check-ignore` reports POSIX-separated paths on every platform,
    // including Windows, so `join` would assert a backslash git never prints.
    expect(found[0]?.sourceLabel).toBe("deployers/.gitignore");
  });

  it("marks a rule broader than deployoor's output as not targeted", () => {
    // `build` is the user's rule about their own directory. Removing it would un-ignore everything
    // under it, so the fix has to be theirs.
    const root = repo("build\n");

    const found = findIgnoredOutput(root, { out: "./build/deployers" });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ pattern: "build", targeted: false });
  });

  it("marks a rule in .git/info/exclude as not editable", () => {
    const root = repo("node_modules\n", (dir) => {
      mkdirSync(join(dir, ".git", "info"), { recursive: true });
      writeFileSync(join(dir, ".git", "info", "exclude"), "deployers/\n");
    });

    const found = findIgnoredOutput(root, DEFAULTS);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ targeted: true, editable: false });
  });

  it("skips an output directory outside the project", () => {
    const root = repo("deployers\n");

    expect(findIgnoredOutput(root, { out: "../shared/deployers" })).toEqual([]);
  });

  it("stays silent outside a git repository, rather than guessing", () => {
    // A `.gitignore` with no repository decides nothing, and git exits 128 here. Reporting a rule
    // would be inventing an answer git declined to give.
    const root = mkdtempSync(join(tmpdir(), "deployoor-nogit-"));
    writeFileSync(join(root, ".gitignore"), "deployers\n");

    expect(findIgnoredOutput(root, DEFAULTS)).toEqual([]);
  });

  it("stays silent when git cannot be run at all", () => {
    const root = repo("deployers\n");

    expect(findIgnoredOutput(root, DEFAULTS, { checkIgnore: () => undefined })).toEqual([]);
  });
});

describe("removeIgnoreRules", () => {
  it("removes the line and the deployoor comment introducing it", () => {
    const root = repo("node_modules\n# generated by `deployoor generate`\ndeployers\ncache\n");

    removeIgnoreRules(findIgnoredOutput(root, DEFAULTS));

    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("node_modules\ncache\n");
  });

  it("keeps a comment that is not about deployoor", () => {
    const root = repo("# build output\ndeployers\n");

    removeIgnoreRules(findIgnoredOutput(root, DEFAULTS));

    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("# build output\n");
  });

  it("removes two rules from one file without deleting the wrong second line", () => {
    // Removing them one at a time shifts every later line number by one, so the second removal would
    // take `.env` instead of `deployments`.
    const root = repo("deployers\ndeployments\n.env\nnode_modules\n");

    const removed = removeIgnoreRules(findIgnoredOutput(root, DEFAULTS));

    expect(removed).toHaveLength(2);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(".env\nnode_modules\n");
  });

  it("leaves CRLF endings and a missing trailing newline as they were", () => {
    const root = repo("node_modules\r\ndeployers\r\ncache");

    removeIgnoreRules(findIgnoredOutput(root, DEFAULTS));

    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("node_modules\r\ncache");
  });

  it("leaves a rule alone when its line changed after git read it", () => {
    const root = repo("deployers\n");
    const found = findIgnoredOutput(root, DEFAULTS);
    writeFileSync(join(root, ".gitignore"), "something-else\n");

    expect(removeIgnoreRules(found)).toEqual([]);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("something-else\n");
  });
});

describe("reviewIgnoredOutput", () => {
  const interactive = (answer: string) => ({
    isInteractive: () => true,
    ask: vi.fn(async () => answer),
    log: vi.fn(),
  });

  it("removes the rule after an explicit yes", async () => {
    const root = repo("deployers\n");
    const deps = interactive("y");

    const removed = await reviewIgnoredOutput(root, DEFAULTS, deps);

    expect(removed).toHaveLength(1);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("");
    expect(deps.ask).toHaveBeenCalledWith("deployoor: remove line 1 of .gitignore now? [y/N] ");
  });

  it("reports but changes nothing on a bare Enter", async () => {
    const root = repo("deployers\n");
    const deps = interactive("");

    expect(await reviewIgnoredOutput(root, DEFAULTS, deps)).toEqual([]);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("deployers\n");
    expect(deps.log.mock.calls.flat().join("\n")).toContain("ignores deployers/" as string);
  });

  it("never asks and never edits without a TTY", async () => {
    // The CI case: the problem is reported so a log reader can see it, and the repository is left
    // exactly as it was found.
    const root = repo("deployers\n");
    const ask = vi.fn(async () => "y");

    const removed = await reviewIgnoredOutput(root, DEFAULTS, {
      isInteractive: () => false,
      ask,
      log: vi.fn(),
    });

    expect(removed).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("deployers\n");
  });

  it("reports a broader rule without offering to remove it", async () => {
    const root = repo("build\n");
    const deps = interactive("y");

    const removed = await reviewIgnoredOutput(root, { out: "./build/deployers" }, deps);

    expect(removed).toEqual([]);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(deps.log.mock.calls.flat().join("\n")).toContain("!build/deployers/" as string);
  });

  it("says nothing at all when there is nothing to report", async () => {
    const root = repo("node_modules\n");
    const deps = interactive("y");

    expect(await reviewIgnoredOutput(root, DEFAULTS, deps)).toEqual([]);
    expect(deps.log).not.toHaveBeenCalled();
  });

  it("counts the lines when more than one is removable", async () => {
    const root = repo("deployers\ndeployments\n");
    const deps = interactive("y");

    const removed: ReadonlyArray<IgnoredOutput> = await reviewIgnoredOutput(root, DEFAULTS, deps);

    expect(removed).toHaveLength(2);
    expect(deps.ask).toHaveBeenCalledWith("deployoor: remove 2 lines now? [y/N] ");
  });
});
