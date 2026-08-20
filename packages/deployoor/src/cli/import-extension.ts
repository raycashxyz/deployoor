import { getTsconfig } from "get-tsconfig";
import type { ImportExtension, ResolvedImportExtension } from "../config";

/**
 * The two resolution modes that reject extensionless relative specifiers (TS2835). Compared
 * lowercased because tsc accepts both casings and real tsconfigs use both — the examples in this
 * repo alone have `"Bundler"` and `"bundler"`.
 */
const NEEDS_EXPLICIT_EXTENSION: ReadonlySet<string> = new Set(["node16", "nodenext"]);

/**
 * The project's tsconfig with `extends` resolved and merged, or `undefined` when there is none or
 * it cannot be read.
 *
 * `get-tsconfig` owns the fiddly half of this — JSONC (comments, trailing commas), the `extends`
 * chain including package presets like `@tsconfig/node22`, `${configDir}`, and searching upward
 * from the project for the nearest config. It is the resolver `tsx` itself uses, so deployoor reads
 * a project the same way the runtime our users run does. A malformed config throws, and is treated
 * as absent: an unreadable tsconfig must never fail `generate`, only fall back to the default form.
 */
const readTsconfig = (root: string) => {
  try {
    return getTsconfig(root)?.config.compilerOptions;
  } catch {
    return undefined;
  }
};

/**
 * `moduleResolution` when stated, else `module` — because tsc infers the resolution from it, so
 * `"module": "nodenext"` alone puts a project in strict-ESM resolution and is enough to hit TS2835.
 * Every other `module` value (`esnext`, `preserve`, `commonjs`) implies a mode that accepts
 * extensionless specifiers, so falling through to the same membership test is correct.
 */
const effectiveResolution = (root: string): string => {
  const options = readTsconfig(root);
  return (options?.moduleResolution ?? options?.module ?? "").toLowerCase();
};

/**
 * Decide whether the generated relative imports in `root` need a `.js` extension. A project with no
 * tsconfig gets `'none'` — the form deployoor has always emitted — so absence never changes output.
 */
export const detectImportExtension = (root: string): ResolvedImportExtension =>
  NEEDS_EXPLICIT_EXTENSION.has(effectiveResolution(root)) ? "js" : "none";

/** The configured setting, or detection when it is absent or `'auto'`. */
export const resolveImportExtension = (
  setting: ImportExtension | undefined,
  root: string,
): ResolvedImportExtension =>
  setting === undefined || setting === "auto" ? detectImportExtension(root) : setting;
