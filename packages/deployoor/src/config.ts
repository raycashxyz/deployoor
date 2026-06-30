import type { AnyDeployPlugin } from "./plugin";
import type { OnPluginError } from "./engine/plugins";

/**
 * `deployoor.config.ts` shape. Authored with `defineConfig`, consumed by both the
 * `deployoor generate` CLI (filter/out) and the generated deployers (deploymentsPath,
 * plugins, onPluginError).
 */
export interface Config<P extends readonly AnyDeployPlugin[] = readonly AnyDeployPlugin[]> {
  /** Where deployment records are written/read. Default "./deployments". */
  readonly deploymentsPath?: string;
  /** Which contracts to generate deployers for. Default: everything with bytecode. */
  readonly include?: ReadonlyArray<string> | RegExp;
  /** Where generated deployers are emitted. Default "./deployers". */
  readonly out?: string;
  /** Lifecycle plugins (verify, notify, …). */
  readonly plugins?: P;
  /** Default plugin-failure policy. "warn" (default) logs and continues; "throw" surfaces it. */
  readonly onPluginError?: OnPluginError;
}

export const defineConfig = <const P extends readonly AnyDeployPlugin[]>(config: Config<P>): Config<P> =>
  config;
