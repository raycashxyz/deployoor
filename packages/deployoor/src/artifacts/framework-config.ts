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

/**
 * `paths.artifacts` from hardhat.config, or undefined. Hardhat 3 keeps the same `paths.artifacts`
 * key, so one reader covers both majors.
 */
export const readHardhatArtifactsPath = async (root: string): Promise<string | undefined> => {
  const configPath = HARDHAT_CONFIGS.map((name) => join(root, name)).find((p) => existsSync(p));
  if (configPath === undefined) return undefined;

  const loaded = await createJiti(import.meta.url)
    .import(configPath, { default: true })
    .catch(() => undefined);

  const artifacts = (loaded as HardhatConfigShape | undefined)?.paths?.artifacts;
  return typeof artifacts === "string" ? artifacts : undefined;
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
  const configPath = join(root, "foundry.toml");
  if (!existsSync(configPath)) return undefined;

  const profile = process.env.FOUNDRY_PROFILE ?? "default";
  // existsSync then readFileSync is not atomic, and an unreadable or replaced file would otherwise
  // throw straight out of a function this module documents as never throwing.
  const contents = readConfig(configPath);
  if (contents === undefined) return undefined;

  // Walk the lines tracking which table we are in, keeping the first `out` in the active profile.
  const found = contents.split(/\r?\n/).reduce<{ table: string | null; out: string | undefined }>(
    (acc, rawLine) => {
      const line = rawLine.replace(/(^|\s)#.*$/, "").trim();
      if (line.length === 0) return acc;

      const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
      if (header?.[1] !== undefined) return { ...acc, table: header[1] };

      if (acc.out !== undefined || acc.table !== `profile.${profile}`) return acc;

      const entry = /^out\s*=\s*(['"])(.*?)\1/.exec(line);
      return entry?.[2] === undefined ? acc : { ...acc, out: entry[2] };
    },
    { table: null, out: undefined },
  );

  return found.out;
};
