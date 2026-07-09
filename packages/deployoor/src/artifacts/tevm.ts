import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Abi } from "viem";
import { ArtifactsNotFound } from "../errors";
import type { Artifact } from "../schemas";
import { toArtifact, isDeployable, type LinkReferences } from "./parse";

export interface ReadTevmOptions {
  /** Directory (relative to root) holding the `.sol` sources to compile. Default "src". */
  readonly sources?: string;
  /** A solc-js instance to compile with. Defaults to the project's installed `solc`. */
  readonly solc?: SolcLike;
}

/** The only bit of a solc-js instance we read directly (the compile call lives in tevm). */
interface SolcLike {
  readonly version: (() => string) | string;
}

// tevm's default compiler config (mirrors @tevm/config's `defaultConfig`), inlined so the
// adapter depends on @tevm/compiler + solc only. Enough for standalone sources; projects that
// need remappings/libs can graduate to Foundry/Hardhat (or we expose these later).
const TEVM_DEFAULT_CONFIG = {
  jsonAsConst: [],
  foundryProject: false,
  remappings: {},
  libs: [],
  debug: false,
  cacheDir: ".tevm",
} as const;

const SILENT_LOGGER = { info: () => {}, warn: () => {}, error: () => {}, log: () => {} };

const solSourcesIn = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? solSourcesIn(full) : full.endsWith(".sol") ? [full] : [];
      })
    : [];

// solc-js reports e.g. "0.8.26+commit.8a97fa7a.Emscripten.clang"; verifiers want the
// canonical "0.8.26+commit.8a97fa7a".
const canonicalSolcVersion = (raw: string): string =>
  /^\d+\.\d+\.\d+\+commit\.[0-9a-fA-F]+/.exec(raw)?.[0] ?? raw;

// Resolve optional deps from the USER'S project root, not from deployoor's own location —
// under pnpm the user's @tevm/compiler/solc are not reachable from deployoor's nested dir.
const requireFromRoot = (root: string) => createRequire(pathToFileURL(join(root, "package.json")).href);

const loadSolc = (root: string, provided: SolcLike | undefined): SolcLike => {
  if (provided !== undefined) return provided;
  try {
    return requireFromRoot(root)("solc") as SolcLike;
  } catch {
    throw new Error("tevm generate needs `solc` installed in your project — add it with `pnpm add -D solc`.");
  }
};

const loadTevmCompiler = async (root: string): Promise<typeof import("@tevm/compiler")> => {
  let entry: string;
  try {
    entry = requireFromRoot(root).resolve("@tevm/compiler");
  } catch {
    throw new Error("tevm generate needs `@tevm/compiler` — add it with `pnpm add -D @tevm/compiler solc`.");
  }
  return import(pathToFileURL(entry).href);
};

const nodeFao = () => ({
  readFile: (path: string, encoding: BufferEncoding) => readFile(path, encoding),
  readFileSync: (path: string, encoding: BufferEncoding) => readFileSync(path, encoding),
  existsSync,
  exists: async (path: string) => existsSync(path),
});

const hexBytecode = (object: string): `0x${string}` =>
  (object.startsWith("0x") ? object : `0x${object}`) as `0x${string}`;

/**
 * Read a tevm project's Solidity sources by compiling them with tevm's programmatic compiler
 * (`@tevm/compiler` + a solc-js instance) — no Hardhat/Foundry project required. Produces the
 * same {@link Artifact} shape the other adapters do (abi, bytecode, and the solc standard-json
 * metadata used for verification). Optional deps are lazy-imported so the core stays light.
 */
export const readTevmArtifacts = async (root: string, opts: ReadTevmOptions = {}): Promise<Artifact[]> => {
  const sourcesDir = resolve(root, opts.sources ?? "src");
  const solFiles = solSourcesIn(sourcesDir);
  if (solFiles.length === 0) throw new ArtifactsNotFound({ dir: sourcesDir });

  const { resolveArtifacts } = await loadTevmCompiler(root);
  const solc = loadSolc(root, opts.solc);
  const compilerVersion = canonicalSolcVersion(
    typeof solc.version === "function" ? solc.version() : String(solc.version),
  );
  const fao = nodeFao();
  const toRel = (abs: string): string => relative(root, resolve(abs)).split(sep).join("/");
  const underSources = (file: string): boolean => resolve(file).startsWith(sourcesDir + sep);

  const perFile = await Promise.all(
    solFiles.map(async (solFile) => {
      const { solcInput, solcOutput } = await resolveArtifacts(
        solFile,
        root,
        SILENT_LOGGER,
        TEVM_DEFAULT_CONFIG,
        false,
        true,
        fao,
        solc,
      );
      if (solcInput === undefined || solcOutput?.contracts === undefined) return [];
      // Rewrite absolute source keys to root-relative so generated code + records stay portable.
      const sources = Object.fromEntries(
        Object.entries(solcInput.sources).map(([key, value]) => [toRel(key), value]),
      );
      const settings = solcInput.settings ?? {};
      // Only the project's own contracts (under sourcesDir) get deployers — skip imported deps
      // (OpenZeppelin, etc.) that solc also compiles and returns.
      return Object.entries(solcOutput.contracts)
        .filter(([file]) => underSources(file))
        .flatMap(([file, contracts]) =>
          Object.entries(contracts).flatMap(([name, contract]) => {
            const bytecode = hexBytecode(contract.evm?.bytecode?.object ?? "");
            if (!isDeployable(bytecode)) return [];
            return [
              toArtifact({
                name,
                sourceName: toRel(file),
                abi: contract.abi as Abi,
                bytecode,
                linkReferences: contract.evm?.bytecode?.linkReferences as LinkReferences | undefined,
                compilerVersion,
                sources,
                settings,
              }),
            ];
          }),
        );
    }),
  );

  // Compiling each entry file independently re-emits any shared/imported project sources, so
  // dedupe by fully-qualified name (keep the first).
  const byFqn = new Map<string, Artifact>();
  perFile.flat().forEach((artifact) => {
    if (!byFqn.has(artifact.metadata.fullyQualifiedName))
      byFqn.set(artifact.metadata.fullyQualifiedName, artifact);
  });
  return [...byFqn.values()];
};
