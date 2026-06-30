import { Effect } from "effect";
import { PluginFailed } from "../errors";
import type { AnyDeployPlugin, DeployedContext, PluginDeps } from "../plugin";

export type OnPluginError = "warn" | "throw";

export interface ActivePlugin {
  readonly plugin: AnyDeployPlugin;
  readonly options: unknown;
}

/**
 * Resolve which plugins run for a deploy and with what per-deploy options.
 * `plugins[name] === false` disables; an object is merged config; absent uses {}.
 */
export const resolveActive = (
  plugins: ReadonlyArray<AnyDeployPlugin>,
  overrides: Readonly<Record<string, unknown>> = {},
): ReadonlyArray<ActivePlugin> =>
  plugins
    .filter((p) => overrides[p.name] !== false)
    .map((p) => {
      const override = overrides[p.name];
      return { plugin: p, options: override === undefined || override === false ? {} : override };
    });

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * Run every active plugin's `onContractDeployed`. A failing hook is always
 * logged and never aborts the deploy (the contract is already on-chain). When
 * `onError` is "throw", a `PluginFailed` is raised AFTER all plugins run, so the
 * caller can surface it (e.g. fail CI) while the deployment stays recorded.
 */
export const runOnContractDeployed = (
  active: ReadonlyArray<ActivePlugin>,
  base: Omit<DeployedContext, "options">,
  deps: PluginDeps,
  onError: OnPluginError,
): Effect.Effect<void, PluginFailed> =>
  Effect.gen(function* () {
    const outcomes = yield* Effect.forEach(active, ({ plugin, options }) => {
      const hook = plugin.onContractDeployed;
      if (hook === undefined) return Effect.succeed({ name: plugin.name, failed: false });
      return Effect.tryPromise({
        try: async () => {
          await hook({ ...base, options }, deps);
        },
        catch: (cause) => cause,
      }).pipe(
        Effect.matchEffect({
          onSuccess: () => Effect.succeed({ name: plugin.name, failed: false }),
          onFailure: (cause) =>
            Effect.sync(() => {
              deps.log.warn(`[${plugin.name}] ${describe(cause)}`);
              return { name: plugin.name, failed: true };
            }),
        }),
      );
    });

    const failed = outcomes.filter((o) => o.failed).map((o) => o.name);
    if (onError === "throw" && failed.length > 0) {
      return yield* Effect.fail(new PluginFailed({ plugins: failed }));
    }
  });
