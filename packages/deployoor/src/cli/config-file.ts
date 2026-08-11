import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";
import type { Config } from "../config";

const CONFIG_NAMES = ["deployoor.config.ts", "deployoor.config.js", "deployoor.config.mjs"];

export interface LoadedConfig {
  readonly config: Config;
  /** Absolute path the config came from; absent when the project has none. */
  readonly configPath?: string;
}

/**
 * Find and evaluate the project's `deployoor.config.*`.
 *
 * Every `Config` field has a default, so discovering no config is not an error — a vanilla project
 * (artifacts auto-detected, no plugins) needs no file, and `deployoor init` is what you run when you
 * actually want to change something. An *explicit* path that does not exist is a mistake worth
 * reporting.
 *
 * `explicitPath` is resolved against `root`, like every other path in a `Config`, so a relative one
 * means the same thing to a caller that passed `root` and to one that changed directory first.
 *
 * Shared by `generateDeployers` and `deployoor verify`: both need the same file, and verify needs
 * `plugins` + `deploymentsPath` out of it.
 */
export const loadConfig = async (root: string, explicitPath?: string): Promise<LoadedConfig> => {
  const explicit = explicitPath === undefined ? undefined : resolve(root, explicitPath);
  if (explicit !== undefined && !existsSync(explicit)) {
    throw new Error(`no deployoor config at ${explicit}`);
  }
  const configPath =
    explicit ?? CONFIG_NAMES.map((name) => join(root, name)).find((path) => existsSync(path));
  if (configPath === undefined) return { config: {} satisfies Config };
  const config = (await createJiti(import.meta.url).import(configPath, { default: true })) as Config;
  return { config, configPath };
};
