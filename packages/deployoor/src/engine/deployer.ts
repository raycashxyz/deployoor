import { resolve } from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import type { Abi, Address, PublicClient, WalletClient } from "viem";
import {
  Clients,
  clientsLayer,
  registerClientsLayer,
  type DeployResult,
  type ReadOnlyContract,
} from "../services/clients";
import { Store, layerFromAdapter } from "../services/store";
import { getOrDeploy, register } from "./pipeline";
import { NoChainOnClient } from "../errors";
import type { ContractConstructorArgs } from "viem";
import type { GeneratedArtifact, Libraries, TypedArtifact } from "../schemas";
import { resolveArtifact } from "../artifacts/resolve";
import type { AnyDeployPlugin, PluginDeps, PluginOverrides } from "../plugin";
import type { OnPluginError } from "./plugins";
import { fsStore, networkKeyForChain, type StoreAdapter } from "../store";
import { resolveStrategy } from "./strategy";
import type { Config, RedeploymentStrategy } from "../config";

export interface GetOrDeployArgs<A extends Abi, P extends readonly AnyDeployPlugin[]> {
  readonly args: ContractConstructorArgs<A>;
  readonly deploymentName?: string;
  readonly redeploymentStrategy?: RedeploymentStrategy;
  readonly libraries?: Libraries;
  readonly plugins?: PluginOverrides<P>;
  /** Override the deployer's plugin-failure policy for this deploy. */
  readonly onPluginError?: OnPluginError;
}

export interface Deployer<P extends readonly AnyDeployPlugin[]> {
  readonly getOrDeploy: <A extends Abi>(
    artifact: TypedArtifact<A>,
    opts: GetOrDeployArgs<A, P>,
  ) => Promise<DeployResult<A>>;
}

export interface CreateDeployerConfig<P extends readonly AnyDeployPlugin[]> {
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly store: StoreAdapter;
  readonly redeploymentStrategy?: RedeploymentStrategy;
  readonly redeploymentStrategyByChainId?: Record<number, RedeploymentStrategy>;
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
 * The single Effect→Promise crossing: provide the Clients + Store layers and run the
 * pipeline program. On failure, reject with the clean tagged error (squashed from the
 * cause) rather than Effect's FiberFailure wrapper. Shared by the deploy and register
 * entry points (register runs on a wallet-optional Clients layer).
 */
const runProgram = async <A, E, LE>(
  program: Effect.Effect<A, E, Clients | Store>,
  layer: Layer.Layer<Clients | Store, LE>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(Effect.provide(program, layer));
  return Exit.match(exit, {
    onSuccess: (value) => value,
    onFailure: (cause) => {
      throw Cause.squash(cause);
    },
  });
};

/**
 * Build a deployer. Generated `getOrDeploy<Name>` functions call this internally; the
 * user never wires it by hand.
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
  return {
    getOrDeploy: (artifact, opts) =>
      // viem types constructor args precisely per-abi; the engine treats them as
      // the runtime array form they always are.
      runProgram(
        getOrDeploy(
          artifact,
          {
            ...opts,
            args: opts.args as readonly unknown[],
            onPluginError: opts.onPluginError ?? config.onPluginError,
          },
          plugins,
          deps,
          (chainId) =>
            resolveStrategy(
              { redeploymentStrategy: opts.redeploymentStrategy },
              {
                redeploymentStrategy: config.redeploymentStrategy,
                redeploymentStrategyByChainId: config.redeploymentStrategyByChainId,
              },
              chainId,
            ),
        ),
        layer,
      ),
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
  readonly redeploymentStrategy?: RedeploymentStrategy;
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
/**
 * The store a generated deployer writes to when the caller passes none. Built per call, not per
 * definition: every path deployoor resolves against the working directory must read it at the same
 * time, or a `chdir` between importing a deployer and invoking it splits the project in two.
 */
const defaultStore = (config: Config): StoreAdapter =>
  fsStore(resolve(config.deploymentsPath ?? "./deployments"));

export const defineDeployer = <A extends Abi, const P extends readonly AnyDeployPlugin[]>(
  artifact: GeneratedArtifact<A> | TypedArtifact<A>,
  config: Config<P>,
) => {
  return async (opts: DeployerCallOptions<A, P>): Promise<DeployResult<A>> =>
    createDeployer({
      walletClient: opts.walletClient,
      publicClient: opts.publicClient,
      // Resolved here rather than when the deployer was defined, so this and `resolveArtifact` below
      // read the working directory at the same moment. Resolving the store at definition time while
      // artifacts resolve at call time meant a `chdir` in between sent records to one project and
      // read artifacts from another. `fsStore` only builds closures, so this costs nothing.
      store: opts.store ?? defaultStore(config),
      plugins: config.plugins,
      onPluginError: config.onPluginError,
      redeploymentStrategy: config.redeploymentStrategy,
      redeploymentStrategyByChainId: config.redeploymentStrategyByChainId,
    }).getOrDeploy(
      // Resolved per call rather than once at definition time: `generate` runs before the deploy
      // script does, so reading the artifact eagerly would fire at import time and fail a project
      // that has not compiled yet even when nothing is being deployed.
      await resolveArtifact(artifact, {
        framework: config.framework,
        artifactsPath: config.artifactsPath,
        sources: config.sources,
      }),
      {
        args: opts.args,
        deploymentName: opts.deploymentName,
        redeploymentStrategy: opts.redeploymentStrategy,
        libraries: opts.libraries,
        plugins: opts.plugins,
        onPluginError: opts.onPluginError,
      },
    );
};

type DeploymentNameOption =
  | { readonly deploymentName: string; readonly name?: string }
  | { readonly name: string; readonly deploymentName?: string };

/** Options a generated `register(...)` accepts: a public client + the external contract's identity. */
export type RegisterCallOptions<A extends Abi> = DeploymentNameOption & {
  /**
   * Optional — `register` records an existing address and never sends a transaction, so a
   * public client is enough. Pass a wallet to record it as the registrant and get a writable
   * contract back; omit it and the deployer is recorded as the zero address (read-only contract).
   */
  readonly walletClient?: WalletClient;
  readonly publicClient: PublicClient;
  readonly address: Address;
  readonly abi: A;
  /** Override the store (default: fsStore at the config's deploymentsPath). */
  readonly store?: StoreAdapter;
};

/**
 * The two shapes `register` resolves to. viem's `getContract` builds a `write` namespace only
 * when it is handed a wallet client, so promising one for a public-client-only call would
 * typecheck `contract.write.foo(...)` and then throw at runtime. Written as overloads rather
 * than a conditional return type so the two cases read as two signatures on hover.
 */
export interface Register {
  <A extends Abi>(
    opts: RegisterCallOptions<A> & { readonly walletClient: WalletClient },
  ): Promise<DeployResult<A>>;
  <A extends Abi>(opts: RegisterCallOptions<A>): Promise<DeployResult<A, ReadOnlyContract<A>>>;
}

/**
 * Build a project-level `register` from the config. `deployoor generate` emits one in the
 * deployers index; the user records a contract they did NOT deploy (e.g. USDC, a partner
 * contract) on the client's chain — no transaction — and gets back the same viem contract
 * object `getOrDeploy` returns. `deploymentName` is the record key (use distinct names to track
 * several instances); `name` is accepted as a compatibility alias.
 */
export const defineRegister = <const P extends readonly AnyDeployPlugin[]>(config: Config<P>): Register => {
  return <A extends Abi>(opts: RegisterCallOptions<A>): Promise<DeployResult<A>> => {
    const deploymentName = opts.deploymentName ?? opts.name;
    if (deploymentName === undefined) throw new Error("register requires deploymentName");
    // register never broadcasts a transaction, so it runs on a wallet-optional Clients
    // layer — a public client alone is enough. Plugins don't run on register.
    const layer = Layer.merge(
      registerClientsLayer(opts.publicClient, opts.walletClient),
      layerFromAdapter(opts.store ?? defaultStore(config)),
    );
    return runProgram(
      register({ name: deploymentName, address: opts.address, abi: opts.abi }, resolveDeps()),
      layer,
    );
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
  return async (opts: ResetCallOptions): Promise<void> => {
    const chain = opts.publicClient.chain;
    if (chain === undefined) throw new NoChainOnClient();
    const active = opts.store ?? defaultStore(config);
    const network = networkKeyForChain(chain);
    const deploymentName = opts.deploymentName ?? opts.name;
    if (deploymentName === undefined) {
      const all = await active.list(network);
      await Promise.all(all.map((r) => active.remove(network, r.deploymentName)));
    } else {
      await active.remove(network, deploymentName);
    }
    // Pinned sources are content-addressed and shared across chains, so they are collected after
    // the records are gone rather than deleted by name — a blob another network still points at
    // has to survive resetting this one.
    await active.pruneSources?.();
  };
};
