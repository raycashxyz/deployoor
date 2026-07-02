import { relative } from "node:path";
import { readArtifacts } from "../artifacts";
import { generate, type GeneratedFile } from "../codegen/generate";

export interface RunGenerateOptions {
  /** Project root (detect + read artifacts from here). */
  readonly root: string;
  /** Absolute directory the deployers are written into. */
  readonly out: string;
  /** Absolute path to the user's deployoor config (the deployers import it). */
  readonly configPath: string;
  /** Which contracts to generate for. Default: all (with bytecode). */
  readonly include?: ReadonlyArray<string> | RegExp;
  /** Runtime package the generated deployers import. Default "deployoor". */
  readonly packageName?: string;
}

const matches = (name: string, include?: ReadonlyArray<string> | RegExp): boolean =>
  include === undefined ? true : include instanceof RegExp ? include.test(name) : include.includes(name);

/** Compute the import specifier from a generated deployer file to the user's config. */
const configSpecifier = (fromDir: string, configPath: string): string => {
  const rel = relative(fromDir, configPath).replace(/\.[mc]?[jt]s$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

/** detect → read → filter → generate. The testable core of `deployoor generate`. */
export const runGenerate = (opts: RunGenerateOptions): ReadonlyArray<GeneratedFile> => {
  const all = readArtifacts(opts.root);
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
  return generate(artifacts, {
    outDir: opts.out,
    configImport: configSpecifier(opts.out, opts.configPath),
    packageName: opts.packageName,
  });
};
