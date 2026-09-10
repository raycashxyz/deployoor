import { relative } from "node:path";
import { readArtifactsAsync, type Framework } from "../artifacts";
import { generate, type GeneratedFile } from "../codegen/generate";
import type { ImportExtension, ResolvedImportExtension } from "../config";
import { resolveImportExtension } from "./import-extension";

export interface RunGenerateOptions {
  /** Project root (detect + read artifacts from here). */
  readonly root: string;
  /** Absolute directory the deployers are written into. */
  readonly out: string;
  /**
   * Absolute path to the user's deployoor config (the deployers import it). Omit when the project
   * has none — the deployers then carry the defaults inline.
   */
  readonly configPath?: string;
  /** Which contracts to generate for. Default: all (with bytecode). */
  readonly include?: ReadonlyArray<string> | RegExp;
  /** Runtime package the generated deployers import. Default "deployoor". */
  readonly packageName?: string;
  /** Toolchain override (else auto-detected). */
  readonly framework?: Framework;
  /** For the tevm framework: the `.sol` sources directory (relative to root). */
  readonly sources?: string;
  /** Artifacts directory, when it is not the framework default. See `Config.artifactsPath`. */
  readonly artifactsPath?: string;
  /**
   * Extension on emitted relative specifiers. Default `'auto'` — detected from `root`'s tsconfig.
   * See `Config.importExtension`.
   */
  readonly importExtension?: ImportExtension;
}

const matches = (name: string, include?: ReadonlyArray<string> | RegExp): boolean =>
  include === undefined ? true : include instanceof RegExp ? include.test(name) : include.includes(name);

/**
 * The runtime extension a config specifier carries when the project needs one: `.ts`/`.js` → `.js`,
 * `.mts`/`.mjs` → `.mjs`, `.cts`/`.cjs` → `.cjs`, keyed off the module marker (`m`/`c`/none). A
 * `deployoor.config.mts` must be imported as `.mjs` — `.js` would not resolve under node16.
 */
const jsExtensionFor = (configPath: string): string => {
  const marker = configPath.match(/\.([mc])?[jt]s$/)?.[1];
  return marker === undefined ? ".js" : `.${marker}js`;
};

/**
 * Compute the import specifier from a generated deployer file to the user's config: the extension
 * is stripped, or rewritten to its runtime form when the project requires explicit extensions.
 */
const configSpecifier = (
  fromDir: string,
  configPath: string,
  importExtension: ResolvedImportExtension,
): string => {
  const rel = relative(fromDir, configPath)
    .replace(/\\/g, "/")
    .replace(/\.[mc]?[jt]s$/, importExtension === "js" ? jsExtensionFor(configPath) : "");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

/** detect → read → filter → generate. The testable core of `deployoor generate`. */
export const runGenerate = async (opts: RunGenerateOptions): Promise<ReadonlyArray<GeneratedFile>> => {
  const all = await readArtifactsAsync(opts.root, {
    framework: opts.framework,
    sources: opts.sources,
    artifactsPath: opts.artifactsPath,
  });
  const artifacts = all.filter((a) => matches(a.name, opts.include));
  if (artifacts.length === 0) {
    const includeHint =
      opts.include === undefined
        ? ""
        : ` Check deployoor.config.ts include; matched none of ${JSON.stringify(all.map((a) => a.name))}.`;
    throw new Error(
      `No deployable contracts matched. Compile first (forge build or npx hardhat compile), then run deployoor generate.${includeHint}`,
    );
  }
  // Surface explicitly-requested names that produced no deployer (a typo, or a contract
  // that failed to compile) — otherwise the drop is silent.
  if (Array.isArray(opts.include)) {
    const emitted = new Set(artifacts.map((a) => a.name));
    const missing = opts.include.filter((name) => !emitted.has(name));
    if (missing.length > 0) {
      console.warn(
        `[deployoor] generate: no deployable contract matched ${JSON.stringify(missing)} — check the name(s) and that those contracts compiled.`,
      );
    }
  }
  const importExtension = resolveImportExtension(opts.importExtension, opts.root);
  return generate(artifacts, {
    outDir: opts.out,
    configImport:
      opts.configPath === undefined ? undefined : configSpecifier(opts.out, opts.configPath, importExtension),
    packageName: opts.packageName,
    importExtension,
  });
};

/** `deployoor generate --json` on stdout: what was written, and nothing else. */
export interface GeneratedFilesJson {
  /** Paths relative to the project root, forward-slashed, in the order they were emitted. */
  readonly files: ReadonlyArray<string>;
}

/**
 * The generated file list as one JSON document.
 *
 * Paths only — a `GeneratedFile` also carries its `contents`, and an artifact module is large enough
 * that printing them would bury the answer in the question. Relative to the project root and always
 * forward-slashed, so the same project produces the same document on any machine.
 */
export const generatedFilesJson = (root: string, files: ReadonlyArray<GeneratedFile>): string => {
  const document: GeneratedFilesJson = {
    files: files.map((file) => relative(root, file.path).replace(/\\/g, "/")),
  };
  return JSON.stringify(document, null, 2);
};

/** The flag block on its own, so the top-level `deployoor --help` can list it without a second "usage:". */
export const GENERATE_FLAG_HELP = `  --json              print the generated file list as JSON (never prompts)`;

export const GENERATE_USAGE = `usage: deployoor generate [--json]

${GENERATE_FLAG_HELP}`;

/** What the command line parsed to. `generate` takes no filters; the output switch is all there is. */
export interface GenerateCliArgs {
  /** `--json`: one JSON document on stdout and nothing else, with nobody prompted. */
  readonly json: boolean;
}

/** The `generate` command line could not be parsed. Nothing has been read or written when this throws. */
export class GenerateUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateUsageError";
  }
}

/** Everything that looks like a flag, so a typo fails instead of being silently ignored. */
const flagNames = (argv: ReadonlyArray<string>): ReadonlyArray<string> =>
  argv
    .filter((token) => token.startsWith("--"))
    .map((token) => token.slice(2).split("=")[0] ?? "")
    .filter((name) => name.length > 0);

/**
 * Parse `deployoor generate`'s own arguments (everything after the command word), before anything
 * else runs. `generate` writes files and can offer to install packages, so a mistyped command line
 * has to stop here with nothing read and nothing written: `--json=true` silently meaning human mode,
 * or a stray `Counter` silently meaning everything, is exactly the unattended surprise `--json`
 * exists to prevent. Same rejections, in the same words, as `parseVerifyArgs`.
 */
export const parseGenerateArgs = (argv: ReadonlyArray<string>): GenerateCliArgs => {
  const unknown = flagNames(argv).filter((name) => name !== "json");
  if (unknown.length > 0) {
    throw new GenerateUsageError(
      `unknown option(s) ${unknown.map((name) => `--${name}`).join(", ")}\n${GENERATE_USAGE}`,
    );
  }
  // `--json=true` — a switch handed a value it has nowhere to put, so it is a typo rather than an intent.
  if (argv.some((token) => token.startsWith("--json="))) {
    throw new GenerateUsageError(`--json takes no value\n${GENERATE_USAGE}`);
  }
  const positional = argv.filter((token) => !token.startsWith("--"));
  if (positional.length > 0) {
    throw new GenerateUsageError(`unexpected argument(s) ${positional.join(", ")}\n${GENERATE_USAGE}`);
  }
  return { json: argv.includes("--json") };
};
