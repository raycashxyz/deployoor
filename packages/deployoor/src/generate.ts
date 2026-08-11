import { resolve } from "node:path";
import { runGenerate } from "./cli/generate";
import { loadConfig } from "./cli/config-file";
import { isDeployoorInstalled } from "./cli/init";

/** A file written by `generateDeployers` — an absolute path and its contents. */
export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

export interface GenerateDeployersOptions {
  /** Project root — where deployoor.config.* and the compiled artifacts live. Default: `process.cwd()`. */
  readonly root?: string;
  /** Explicit config path. By default the config is discovered in `root`. */
  readonly configPath?: string;
}

/**
 * Programmatic `deployoor generate`: discover the config, read the compiled artifacts, and
 * write the typed deployers — the same work the `deployoor generate` CLI does, exposed as a
 * function so a build hook (e.g. `@deployoor/hardhat` after `hardhat compile`) can run it in
 * process, with no extra terminal. Returns the files written. Exposed at the `deployoor/generate`
 * subpath so importing it never pulls the Node-only codegen into the main runtime entry.
 */
export const generateDeployers = async (
  opts: GenerateDeployersOptions = {},
): Promise<ReadonlyArray<GeneratedFile>> => {
  const root = resolve(opts.root ?? process.cwd());
  if (!isDeployoorInstalled(root)) {
    throw new Error(
      "cannot find `deployoor` from this project — the generated deployers import it. Declare it in package.json or install it: `pnpm add -D deployoor viem`.",
    );
  }
  // A project with no config file still generates — the deployers carry the Config defaults inline.
  const { config, configPath } = await loadConfig(root, opts.configPath);
  const out = resolve(root, config.out ?? "./deployers");
  return runGenerate({
    root,
    out,
    configPath,
    include: config.include,
    framework: config.framework,
    sources: config.sources,
    artifactsPath: config.artifactsPath,
  });
};
