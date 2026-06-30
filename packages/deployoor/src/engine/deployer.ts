import { resolve } from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import type { Abi, PublicClient, WalletClient } from "viem";
import { Clients, clientsLayer, type DeployedContract } from "../services/clients";
import { Store, layerFromAdapter } from "../services/store";
import { getOrDeploy, register, reset, type RegisterEntry } from "./pipeline";
import type { ContractConstructorArgs } from "viem";
import type { Libraries, TypedArtifact } from "../schemas";
import type { AnyDeployPlugin, PluginDeps, PluginOverrides } from "../plugin";
import type { OnPluginError } from "./plugins";
import { fsStore, type StoreAdapter } from "../store";
import type { Config } from "../config";

export interface GetOrDeployArgs<A extends Abi, P extends readonly AnyDeployPlugin[]> {
  readonly args: ContractConstructorArgs<A>;
  readonly deploymentName?: string;
  readonly force?: boolean;
  readonly libraries?: Libraries;
  readonly plugins?: PluginOverrides<P>;
  /** Override the deployer's plugin-failure policy for this deploy. */
  readonly onPluginError?: OnPluginError;
}

export interface Deployer<P extends readonly AnyDeployPlugin[]> {
  readonly getOrDeploy: <A extends Abi>(
    artifact: TypedArtifact<A>,
    opts: GetOrDeployArgs<A, P>,
  ) => Promise<DeployedContract<A>>;
  readonly register: <A extends Abi>(entry: RegisterEntry<A>) => Promise<DeployedContract<A>>;
  readonly reset: (name?: string) => Promise<void>;
}

export interface CreateDeployerConfig<P extends readonly AnyDeployPlugin[]> {
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly store: StoreAdapter;
  readonly plugins?: P;
  /** Default plugin-failure policy. "warn" (default) logs and continues; "throw" surfaces the failure. */
  readonly onPluginError?: OnPluginError;
  readonly deps?: Partial<PluginDeps>;
}

const resolveDeps = (over?: Partial<PluginDeps>): PluginDeps => ({
  fetch: globalThis.fetch,
  now: () => Date.now(),
  log: { info: (m) => console.info(m), warn: (m) => console.warn(m) },
  ...over,
});

/**
 * Build a deployer. This is the ONLY place Effect crosses to a Promise: the
 * pipeline programs are provided the Clients + Store layers and run here.
 */
export const createDeployer = <const P extends readonly AnyDeployPlugin[]>(
  config: CreateDeployerConfig<P>,
): Deployer<P> => {
  const deps = resolveDeps(config.deps);
  const plugins: ReadonlyArray<AnyDeployPlugin> = config.plugins ?? [];
  const layer = Layer.merge(
    clientsLayer(config.walletClient, config.publicClient),
    layerFromAdapter(config.store),
  );
  // The only Effect→Promise crossing. On failure, reject with the clean tagged
  // error (squashed from the cause) rather than Effect's FiberFailure wrapper.
  const run = async <A, E>(program: Effect.Effect<A, E, Clients | Store>): Promise<A> => {
    const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
    return Exit.match(exit, {
      onSuccess: (value) => value,
      onFailure: (cause) => {
        throw Cause.squash(cause);
      },
    });
  };

  return {
    getOrDeploy: (artifact, opts) =>
      // viem types constructor args precisely per-abi; the engine treats them as
      // the runtime array form they always are.
      run(
        getOrDeploy(
          artifact,
          {
            ...opts,
            args: opts.args as readonly unknown[],
            onPluginError: opts.onPluginError ?? config.onPluginError,
          },
          plugins,
          deps,
        ),
      ),
    register: (entry) => run(register(entry, deps)),
    reset: (name) => run(reset(name)),
  };
};

/**
 * Options a generated deployer accepts at call time — just clients + args. The
 * store and plugins come from the project's deployoor.config; the user never wires
 * `createDeployer` or a store directly.
 */
export interface DeployerCallOptions<A extends Abi, P extends readonly AnyDeployPlugin[]> {
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly args: ContractConstructorArgs<A>;
  readonly deploymentName?: string;
  readonly force?: boolean;
  readonly libraries?: Libraries;
  readonly plugins?: PluginOverrides<P>;
  readonly onPluginError?: OnPluginError;
}

/**
 * Build a per-contract deployer from a (generated) artifact + the project config.
 * This is what `deployoor generate` emits one of per contract — the user imports the
 * result and calls it with a viem client:
 *
 *   // generated/deployers/RaycashUSD.ts
 *   export const deployRaycashUSD = defineDeployer(raycashUsdArtifact, config);
 *   // user code
 *   await deployRaycashUSD({ walletClient, publicClient, args: [owner] });
 */
export const defineDeployer = <A extends Abi, const P extends readonly AnyDeployPlugin[]>(
  artifact: TypedArtifact<A>,
  config: Config<P>,
) => {
  const store = fsStore(resolve(config.deploymentsPath ?? "./deployments"));
  return (opts: DeployerCallOptions<A, P>): Promise<DeployedContract<A>> =>
    createDeployer({
      walletClient: opts.walletClient,
      publicClient: opts.publicClient,
      store,
      plugins: config.plugins,
      onPluginError: config.onPluginError,
    }).getOrDeploy(artifact, {
      args: opts.args,
      deploymentName: opts.deploymentName,
      force: opts.force,
      libraries: opts.libraries,
      plugins: opts.plugins,
      onPluginError: opts.onPluginError,
    });
};
