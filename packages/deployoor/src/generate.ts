import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";
import { runGenerate } from "./cli/generate";
import { isDeployoorInstalled } from "./cli/init";
import type { Config } from "./config";

/** A file written by `generateDeployers` — an absolute path and its contents. */
export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

const CONFIG_NAMES = ["deployoor.config.ts", "deployoor.config.js", "deployoor.config.mjs"];

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
  const configPath =
    opts.configPath ?? CONFIG_NAMES.map((name) => join(root, name)).find((p) => existsSync(p));
  // An explicit configPath that does not exist is a mistake worth reporting; discovering none is
  // not. Every Config field has a default, so a vanilla project (artifacts auto-detected, no
  // plugins) needs no config file — the generated deployers carry the defaults inline instead,
  // and `deployoor init` becomes what you run when you actually want to change something.
  if (opts.configPath !== undefined && !existsSync(opts.configPath)) {
    throw new Error(`no deployoor config at ${opts.configPath}`);
  }
  const config =
    configPath === undefined
      ? ({} satisfies Config)
      : ((await createJiti(import.meta.url).import(configPath, { default: true })) as Config);
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
