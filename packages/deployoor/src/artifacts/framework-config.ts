import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";

/**
 * Read the artifacts directory out of the *framework's own* config, so a project that moved its
 * output works with no deployoor config at all.
 *
 * Both readers are best-effort and never throw: a failure falls back to the framework default, and
 * the caller then reports a missing directory with its usual message. That matters because
 * hardhat.config is arbitrary user code — it can import plugins, read env vars, or simply fail to
 * load — and being unable to read it is not a reason to refuse to generate.
 */

/** Reads a config file, or undefined if it cannot be read — keeps both readers total. */
const readConfig = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

const HARDHAT_CONFIGS = [
  "hardhat.config.ts",
  "hardhat.config.js",
  "hardhat.config.cjs",
  "hardhat.config.mjs",
] as const;

/** Shape we care about; a Hardhat config may legitimately have neither key. */
interface HardhatConfigShape {
  readonly paths?: { readonly artifacts?: unknown };
}

/** Line and block comments. The `[^:\\]` guard keeps the `//` in `https://…` from starting one. */
const COMMENTS = /\/\*[\s\S]*?\*\/|(^|[^:\\])\/\/[^\n]*/gm;

/** A quoted string, captured as delimiter + contents so the contents can be blanked. */
const STRINGS = /(['"`])((?:[^'"`\\\n]|\\.)*)\1/g;

/** The `{` that opens the exported config object — `module.exports = {` or `export default {`. */
const EXPORT_OPENS = /(?:module\s*\.\s*exports\s*=|export\s+default)[^{]*\{/;

/** A literal string value under an `artifacts` key, matched at a known offset. */
const ARTIFACTS_LITERAL = /^\s*artifacts\s*:\s*(['"`])([^'"`]*)\1/;

/**
 * `source` with comments and string *contents* replaced by filler of identical length.
 *
 * Equal length is the point: every index in the result still refers to the same character of the
 * original, so structure can be analysed on this copy and the value read back out of the real source.
 * Newlines survive so a line comment cannot swallow the line after it.
 */
const blankNonCode = (source: string): string =>
  source
    .replace(COMMENTS, (match: string, keep: string | undefined) => {
      const prefix = keep ?? "";
      return prefix + match.slice(prefix.length).replace(/[^\n]/g, " ");
    })
    .replace(
      STRINGS,
      (_match, quote: string, contents: string) => quote + "\0".repeat(contents.length) + quote,
    );

/**
 * Offsets of every `<name>:` key sitting at brace depth `depth` within `body`.
 *
 * `body` must start at an opening `{`, and must be blanked source — a `{` inside a string literal
 * would otherwise shift every depth after it.
 */
const keyOffsetsAtDepth = (body: string, name: string, depth: number): readonly number[] => {
  const depths = [...body].reduce<{ readonly at: readonly number[]; readonly depth: number }>(
    (acc, char) => ({
      at: [...acc.at, char === "}" ? acc.depth : acc.depth + (char === "{" ? 1 : 0)],
      depth: acc.depth + (char === "{" ? 1 : char === "}" ? -1 : 0),
    }),
    { at: [], depth: 0 },
  ).at;

  return [...body.matchAll(new RegExp(`\\b${name}\\s*:`, "g"))]
    .map((match) => match.index)
    .filter((index): index is number => index !== undefined && depths[index] === depth);
};

/**
 * A literal `paths.artifacts` read out of config *source*, or undefined when it cannot be proven.
 *
 * The fallback for a config that will not evaluate. Reading a value out of code with text is the wrong
 * tool, and three separate review findings landed on this before it was structural rather than a
 * pattern — a commented-out `paths` block, a `paths` nested in `networks`, and an `artifacts` nested
 * inside `paths` each beat the real one purely by coming first in the file. So this does the smallest
 * amount of actual parsing that makes the answer provable:
 *
 * 1. Comments and string contents are blanked (`blankNonCode`), so nothing inside either is read as
 *    structure, and a `{` in a string cannot shift the brace depth.
 * 2. The exported object is located, and `paths` is required to be a **direct** key of it — a `paths`
 *    belonging to `networks.local` is at the wrong depth and is not considered.
 * 3. `artifacts` is required to be a **direct** key of that `paths` object, so a decoy one nested
 *    inside it is likewise ignored rather than preferred.
 * 4. The value is then read from the original source at that exact offset, and only a quoted literal
 *    matches — a computed path (`join(__dirname, …)`) yields nothing.
 *
 * Anything it cannot prove returns undefined, which costs only the framework default and the error the
 * caller already raises naming `artifactsPath`. The bias is deliberate: a wrong directory that happens
 * to hold old artifacts is a silent deploy of stale bytecode, which is worse than any error.
 */
const artifactsFromSource = (source: string): string | undefined => {
  const blanked = blankNonCode(source);
  const exported = EXPORT_OPENS.exec(blanked);
  if (exported?.index === undefined) return undefined;

  const objectAt = exported.index + exported[0].length - 1;
  const body = blanked.slice(objectAt);

  const pathsKeys = keyOffsetsAtDepth(body, "paths", 1);
  const pathsAt = pathsKeys.length === 1 ? pathsKeys[0] : undefined;
  if (pathsAt === undefined) return undefined;

  const pathsObjectAt = body.indexOf("{", pathsAt);
  if (pathsObjectAt === -1) return undefined;

  const artifactsKeys = keyOffsetsAtDepth(body.slice(pathsObjectAt), "artifacts", 1);
  const artifactsAt = artifactsKeys.length === 1 ? artifactsKeys[0] : undefined;
  if (artifactsAt === undefined) return undefined;

  // Read the value from the real source, at the offset the blanked copy proved is the right one.
  return ARTIFACTS_LITERAL.exec(source.slice(objectAt + pathsObjectAt + artifactsAt))?.[2];
};

/**
 * `paths.artifacts` from hardhat.config, or undefined. Hardhat 3 keeps the same `paths.artifacts`
 * key, so one reader covers both majors.
 *
 * Two attempts, because evaluating the config is the accurate answer but frequently impossible.
 * hardhat.config is arbitrary code, and one that registers a plugin — `require("@deployoor/hardhat")`,
 * or any of the plugins a real project uses — throws `HH5: HardhatContext is not created` when it is
 * imported outside a Hardhat run. That is the common shape of a Hardhat project, not an edge case, so
 * treating the failure as "no `paths.artifacts`" meant most projects with a moved artifacts directory
 * were told to configure something deployoor was supposed to read for them. Worse, it failed at
 * *deploy* time while `generate` succeeded, because the Hardhat plugin passes the path in directly.
 *
 * So the import is tried first and wins when it works, and the text scan covers the configs it cannot
 * load. Still best-effort: both failing lands on the framework default, and the caller reports that.
 */
export const readHardhatArtifactsPath = async (root: string): Promise<string | undefined> => {
  const configPath = HARDHAT_CONFIGS.map((name) => join(root, name)).find((p) => existsSync(p));
  if (configPath === undefined) return undefined;

  const loaded = await createJiti(import.meta.url)
    .import(configPath, { default: true })
    .catch(() => undefined);

  const artifacts = (loaded as HardhatConfigShape | undefined)?.paths?.artifacts;
  if (typeof artifacts === "string") return artifacts;

  const contents = readConfig(configPath);
  return contents === undefined ? undefined : artifactsFromSource(contents);
};

/**
 * `out` from the active profile in foundry.toml, or undefined.
 *
 * Hand-parsed rather than pulling in a TOML dependency: this reads exactly one key from one table,
 * and the alternative is shipping a parser to every consumer for that. It handles the forms Foundry
 * actually writes — `[profile.default]` headers, `out = "artifacts"` with either quote style, and
 * comments — and returns undefined on anything it does not recognise, which lands on the default.
 */
export const readFoundryOutPath = (root: string): string | undefined => {
  // Any Foundry config key can be set as FOUNDRY_<KEY>, and that beats the file, so an
  // `out` in foundry.toml would be the wrong answer whenever this is set.
  const fromEnv = process.env.FOUNDRY_OUT;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;

  const configPath = join(root, "foundry.toml");
  if (!existsSync(configPath)) return undefined;

  // existsSync then readFileSync is not atomic, and an unreadable or replaced file would otherwise
  // throw straight out of a function this module documents as never throwing.
  const contents = readConfig(configPath);
  if (contents === undefined) return undefined;

  // Collect `out` for every profile table, because the active profile may not declare one:
  // every Foundry profile inherits from `[profile.default]`, so a project that sets `out` in
  // default and selects a narrower profile with FOUNDRY_PROFILE still builds into that directory.
  // Keying only on the active table read it as absent and fell back to `./out`.
  const outs = contents.split(/\r?\n/).reduce<{ table: string | null; outs: Record<string, string> }>(
    (acc, rawLine) => {
      const line = rawLine.replace(/(^|\s)#.*$/, "").trim();
      if (line.length === 0) return acc;

      const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
      if (header?.[1] !== undefined) return { ...acc, table: header[1] };

      const table = acc.table;
      // First declaration in a table wins, matching how a TOML parser would reject a duplicate key.
      if (table === null || !table.startsWith("profile.") || acc.outs[table] !== undefined) return acc;

      const entry = /^out\s*=\s*(['"])(.*?)\1/.exec(line);
      return entry?.[2] === undefined ? acc : { ...acc, outs: { ...acc.outs, [table]: entry[2] } };
    },
    { table: null, outs: {} },
  ).outs;

  const profile = process.env.FOUNDRY_PROFILE ?? "default";
  return outs[`profile.${profile}`] ?? outs["profile.default"];
};
