import type { AnyDeployPlugin } from "./plugin";
import type { OnPluginError } from "./engine/plugins";
import type { Framework } from "./artifacts";

/**
 * `deployoor.config.ts` shape. Authored with `defineConfig`, consumed by both the
 * `deployoor generate` CLI (filter/out) and the generated deployers (deploymentsPath,
 * plugins, onPluginError).
 */
/** When a recorded deployment exists, whether the next `getOrDeploy` reuses it or redeploys. */
export type RedeploymentStrategy = "never" | "on-change" | "always";

/**
 * Whether the relative imports in generated deployers carry an explicit extension.
 *
 * TypeScript only *requires* one under `moduleResolution: node16 | nodenext`, where an
 * extensionless relative specifier is an error (TS2835) — that is Hardhat 3's default. Everywhere
 * else (`bundler`, `node10`, and every bundler/tsx runtime) extensionless is the idiomatic form,
 * and `.js` is noise a setup which does not map `.js` back to `.ts` can actively trip over
 * (webpack without `resolve.extensionAlias`, ts-jest without a `moduleNameMapper`).
 *
 * So the emitted form follows the project rather than picking a side: `'auto'` reads the tsconfig.
 */
export type ImportExtension = "auto" | "none" | "js";

/** `'auto'` resolved against a project — what the templates actually emit. */
export type ResolvedImportExtension = "none" | "js";

export interface Config<P extends readonly AnyDeployPlugin[] = readonly AnyDeployPlugin[]> {
  /** Where deployment records are written/read. Default "./deployments". */
  readonly deploymentsPath?: string;
  /** Which contracts to generate deployers for. Default: everything with bytecode. */
  readonly include?: ReadonlyArray<string> | RegExp;
  /** Where generated deployers are emitted. Default "./deployers". */
  readonly out?: string;
  /**
   * Whether generated relative imports carry an explicit `.js` extension. Default `'auto'`: read
   * the project's tsconfig and emit them only under `moduleResolution: node16 | nodenext` (Hardhat
   * 3's default), which is the one setup where TypeScript rejects extensionless relative specifiers
   * (TS2835). A `bundler`/tsx project keeps the extensionless form. Set `'js'` or `'none'` to force
   * it — e.g. `'none'` for a bundler that does not map `.js` back to `.ts`.
   */
  readonly importExtension?: ImportExtension;
  /**
   * Toolchain override for `deployoor generate`. Auto-detected from the project by default:
   * Foundry (`foundry.toml`/`out/`), Hardhat v2/v3 (`hardhat.config.*`/`artifacts/`), or tevm —
   * the last from a `tevm.config.*` or, as a zero-config fallback, a plain-`.sol` project with no
   * Foundry/Hardhat markers and sources under `src/` or `contracts/`. Set explicitly only to
   * disambiguate a mixed setup or when tevm sources live outside `src/`/`contracts/`.
   */
  readonly framework?: Framework;
  /**
   * For the `tevm` framework only: directory of `.sol` sources to compile. Default "./src".
   * Ignored by the Hardhat/Foundry adapters (they read `artifacts/` / `out/`).
   */
  readonly sources?: string;
  /**
   * Where the compiled artifacts are, when they are not in the framework's default directory
   * (Hardhat `./artifacts`, Foundry `./out`). Set this to mirror a `paths.artifacts` in
   * hardhat.config or an `out` in foundry.toml. deployoor already reads both of those settings
   * automatically, so set this only to override the location it resolves, or when neither config
   * states it. Ignored by the tevm adapter, which compiles `sources` instead.
   */
  readonly artifactsPath?: string;
  /** Lifecycle plugins (verify, notify, …). */
  readonly plugins?: P;
  /** Default plugin-failure policy. "warn" (default) logs and continues; "throw" surfaces it. */
  readonly onPluginError?: OnPluginError;
  /**
   * When a recorded deployment already exists, decide whether to redeploy. Default `'on-change'`:
   * redeploy iff the deploy identity (metadata-stripped runtime bytecode + constructor args +
   * linked libraries) moved. `'never'` reuses the record and warns on drift; `'always'` redeploys
   * every call. Overridable per call (`redeploymentStrategy` on a deployer) and per chain (below).
   */
  readonly redeploymentStrategy?: RedeploymentStrategy;
  /** Per-chain override of `redeploymentStrategy`, keyed by chain id (e.g. `{ [mainnet.id]: 'never' }`). */
  readonly redeploymentStrategyByChainId?: Record<number, RedeploymentStrategy>;
}

export const defineConfig = <const P extends readonly AnyDeployPlugin[]>(config: Config<P>): Config<P> =>
  config;
