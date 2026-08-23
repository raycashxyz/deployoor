import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createEvmNode, type EvmNode, type EvmOptions, type SnapshotId } from "@deployoor/evm";
import {
  DeploymentRecord,
  memoryStore,
  networkKeyForChain,
  type ChainIdentity,
  type StoreAdapter,
  type DeploymentRecord as DeploymentRecordType,
} from "deployoor";

export type {
  Cheatcodes as TestCheatcodes,
  EvmProvider as TestProvider,
  EvmWalletClient as TestWalletClient,
  ForkOptions,
  MineParams,
  SetAccountParams,
  SnapshotId,
} from "@deployoor/evm";

export type TestAccounts = EvmNode["accounts"];

export type CreateTestClientsOptions = EvmOptions & {
  /**
   * Seed the in-memory deployment store from committed production/testnet records.
   * Pass a deployments/ path or records. With `deploymentNetwork`, matching records
   * are remapped to the in-memory chain so `getOrDeploy` reuses them in fork tests.
   */
  readonly deployments?: string | ReadonlyArray<DeploymentRecordType>;
  /** Source network folder/key to load when `deployments` is a path (e.g. "1-ethereum"). */
  readonly deploymentNetwork?: string;
};

/**
 * Viem clients backed by a single in-memory EVM, plus the deployoor-specific half: an
 * ephemeral store, optionally seeded from committed deployment records.
 *
 * The EVM itself comes from `@deployoor/evm`, which is private to this monorepo and
 * bundled in here — `deployoor`'s own tests need the same EVM, and they cannot depend
 * on this package without closing a cycle.
 */
export type TestClients = EvmNode & {
  /**
   * A fresh **in-memory** deployment store. Spread it into deploy calls
   * (`getOrDeployToken({ ...clients, args })`) so deploys never touch disk and vanish
   * with the test — no stale `deployments/` files, no cross-run reuse.
   */
  readonly store: StoreAdapter;
};

const jsonFiles = (dir: string): readonly string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? jsonFiles(full) : full.endsWith(".json") ? [full] : [];
      })
    : [];

const readDeploymentRecords = (
  source: string | ReadonlyArray<DeploymentRecordType> | undefined,
  deploymentNetwork: string | undefined,
  activeChain: ChainIdentity,
): ReadonlyArray<DeploymentRecordType> => {
  if (source === undefined) return [];
  // Remap BOTH networkName and chainId onto the in-memory chain: the record is being
  // deliberately projected into the test EVM, and getOrDeploy's chain-mismatch guard
  // (record.chainId vs client chain id) must see them as the same chain to reuse it.
  const remap = (record: DeploymentRecordType): DeploymentRecordType => ({
    ...record,
    networkName: networkKeyForChain(activeChain),
    chainId: activeChain.id,
  });
  if (typeof source !== "string") return source.map(remap);

  return jsonFiles(source).flatMap((file) => {
    const parsed = DeploymentRecord.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) return [];
    const relative = file.slice(source.length + 1);
    const folder = relative.split(/[\\/]/).at(0);
    const matches =
      deploymentNetwork === undefined ||
      parsed.data.networkName === deploymentNetwork ||
      String(parsed.data.chainId) === deploymentNetwork ||
      folder === deploymentNetwork;
    return matches ? [remap(parsed.data)] : [];
  });
};

const splitOptions = (
  options: CreateTestClientsOptions | undefined,
): {
  readonly evmOptions: EvmOptions;
  readonly deployments: string | ReadonlyArray<DeploymentRecordType> | undefined;
  readonly deploymentNetwork: string | undefined;
} => {
  if (options === undefined) {
    return { evmOptions: {}, deployments: undefined, deploymentNetwork: undefined };
  }
  const { deployments, deploymentNetwork, ...evmOptions } = options;
  return { evmOptions, deployments, deploymentNetwork };
};

/**
 * Spin up a real EVM ([EDR](https://github.com/NomicFoundation/edr), the engine behind
 * Hardhat 3) in-process and expose it as ordinary viem wallet/public clients — no
 * `hardhat node`, no anvil, no RPC. Hand the clients straight to a generated deployer:
 *
 * ```ts
 * const clients = await createTestClients();
 * // spread `clients` so deploys use the in-memory store — nothing hits disk
 * const { contract: token } = await getOrDeployToken({ ...clients, args: [owner] });
 * ```
 *
 * Deploys go to an in-memory `store` that's discarded when the test ends (no
 * `deployments/` files, no cross-run reuse). For multiple interacting addresses use
 * `accounts` + `walletClientFor`; fork a live chain with `{ fork: { url } }`.
 */
export const createTestClients = async (options?: CreateTestClientsOptions): Promise<TestClients> => {
  const { evmOptions, deployments, deploymentNetwork } = splitOptions(options);
  const node = await createEvmNode(evmOptions);
  const seed = readDeploymentRecords(deployments, deploymentNetwork, node.chain);
  return { ...node, store: memoryStore(seed) };
};

/**
 * Hardhat-style fixture helper backed by `snapshot`/`revert`. The first call runs
 * `setup` and snapshots EVM state; later calls restore it.
 */
export const createFixture = <T>(
  setup: (clients: TestClients) => Promise<T> | T,
): ((clients: TestClients) => Promise<T>) => {
  // Keyed per clients instance, not a single slot: a snapshot id is only meaningful on
  // the provider that issued it. One cache would revert a second, independent EVM with
  // the first one's id — which resolves `false` and would silently hand back a value
  // that was never applied to it.
  const cache = new WeakMap<TestClients, { readonly id: SnapshotId; readonly value: T }>();
  return async (clients) => {
    const cached = cache.get(clients);
    if (cached === undefined) {
      const value = await setup(clients);
      cache.set(clients, { value, id: await clients.cheatcodes.snapshot() });
      return value;
    }
    // `revert` resolves false for an id that was already consumed or never existed.
    // Swallowing that would re-snapshot unrestored state and hand back the cached
    // value anyway, so every later assertion would run against leaked state.
    const restored = await clients.cheatcodes.revert(cached.id);
    if (!restored)
      throw new Error("createFixture could not restore its snapshot: the id was already consumed");
    // `revert` consumes the id, so re-snapshot the same point for the next call.
    cache.set(clients, { value: cached.value, id: await clients.cheatcodes.snapshot() });
    return cached.value;
  };
};
