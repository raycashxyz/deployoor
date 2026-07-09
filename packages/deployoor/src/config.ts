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
  /**
   * Toolchain override for `deployoor generate`. Auto-detected from the project by default
   * (Hardhat v2/v3, Foundry, or tevm); set explicitly for a plain-`.sol` project you want
   * compiled with tevm, or to disambiguate a mixed setup.
   */
  readonly framework?: "hardhat" | "foundry" | "tevm";
  /**
   * For the `tevm` framework only: directory of `.sol` sources to compile. Default "./src".
   * Ignored by the Hardhat/Foundry adapters (they read `artifacts/` / `out/`).
   */
  readonly sources?: string;
  /** Lifecycle plugins (verify, notify, …). */
  readonly plugins?: P;
  /** Default plugin-failure policy. "warn" (default) logs and continues; "throw" surfaces it. */
  readonly onPluginError?: OnPluginError;
}

export const defineConfig = <const P extends readonly AnyDeployPlugin[]>(config: Config<P>): Config<P> =>
  config;
