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
