import { resolve } from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import type { Abi, Address, PublicClient, WalletClient } from "viem";
import { Clients, clientsLayer, type DeployedContract } from "../services/clients";
import { Store, layerFromAdapter } from "../services/store";
import { getOrDeploy, register, type RegisterEntry } from "./pipeline";
import { NoChainOnClient } from "../errors";
import type { ContractConstructorArgs } from "viem";
import type { Libraries, TypedArtifact } from "../schemas";
import type { AnyDeployPlugin, PluginDeps, PluginOverrides } from "../plugin";
import type { OnPluginError } from "./plugins";
import { fsStore, networkKeyForChain, type StoreAdapter } from "../store";
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
  /** Override the store (default: fsStore at the config's deploymentsPath). Pass an in-memory store for tests. */
  readonly store?: StoreAdapter;
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
      store: opts.store ?? store,
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

type DeploymentNameOption =
  | { readonly deploymentName: string; readonly name?: string }
  | { readonly name: string; readonly deploymentName?: string };

/** Options a generated `register(...)` accepts: clients + the external contract's identity. */
export type RegisterCallOptions<A extends Abi> = DeploymentNameOption & {
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly address: Address;
  readonly abi: A;
  /** Override the store (default: fsStore at the config's deploymentsPath). */
  readonly store?: StoreAdapter;
};

/**
 * Build a project-level `register` from the config. `deployoor generate` emits one in the
 * deployers index; the user records a contract they did NOT deploy (e.g. USDC, a partner
 * contract) on the client's chain — no transaction — and gets back the same viem contract
 * object `getOrDeploy` returns. `deploymentName` is the record key (use distinct names to track
 * several instances); `name` is accepted as a compatibility alias.
 */
export const defineRegister = <const P extends readonly AnyDeployPlugin[]>(config: Config<P>) => {
  const store = fsStore(resolve(config.deploymentsPath ?? "./deployments"));
  return <A extends Abi>(opts: RegisterCallOptions<A>): Promise<DeployedContract<A>> => {
    const deploymentName = opts.deploymentName ?? opts.name;
    if (deploymentName === undefined) throw new Error("register requires deploymentName");
    return createDeployer({
      walletClient: opts.walletClient,
      publicClient: opts.publicClient,
      store: opts.store ?? store,
      plugins: config.plugins,
      onPluginError: config.onPluginError,
    }).register({ name: deploymentName, address: opts.address, abi: opts.abi });
  };
};

/** Options a generated `reset(...)` accepts: a public client (for the chain) + an optional name. */
export interface ResetCallOptions {
  readonly publicClient: PublicClient;
  /** Forget just this deployment; omit to forget every deployment on the client's chain. */
  readonly name?: string;
  /** Preferred spelling for the deployment record key; `name` remains a compatibility alias. */
  readonly deploymentName?: string;
  /** Override the store (default: fsStore at the config's deploymentsPath). */
  readonly store?: StoreAdapter;
}

/**
 * Build a project-level `reset` from the config. Forgets recorded deployment(s) on the
 * public client's chain so the next `getOrDeploy` deploys fresh. This is a pure
 * local-records operation — it never touches on-chain state, so it needs only a public
 * client (no signer). Scoped to that client's chain.
 */
export const defineReset = <const P extends readonly AnyDeployPlugin[]>(config: Config<P>) => {
  const store = fsStore(resolve(config.deploymentsPath ?? "./deployments"));
  return async (opts: ResetCallOptions): Promise<void> => {
    const chain = opts.publicClient.chain;
    if (chain === undefined) throw new NoChainOnClient();
    const active = opts.store ?? store;
    const network = networkKeyForChain(chain);
    const deploymentName = opts.deploymentName ?? opts.name;
    if (deploymentName === undefined) {
      const all = await active.list(network);
      await Promise.all(all.map((r) => active.remove(network, r.deploymentName)));
    } else {
      await active.remove(network, deploymentName);
    }
  };
};
