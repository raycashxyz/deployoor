import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createWalletClient, createPublicClient, custom, numberToHex, type EIP1193RequestFn } from "viem";
import type { Account, Address, Chain, Hex, PublicClient, WalletClient } from "viem";
import {
  DeploymentRecord,
  memoryStore,
  networkKeyForChain,
  type ChainIdentity,
  type StoreAdapter,
  type DeploymentRecord as DeploymentRecordType,
} from "deployoor";
import {
  accounts as prefunded,
  chainFor,
  createEvmProvider,
  DEFAULT_CHAIN_ID,
  requestFor,
  type EvmOptions,
  type TestProvider,
} from "./edr";

export type { ForkOptions, TestProvider } from "./edr";

export type TestAccounts = readonly [Account, Account, ...Account[]];

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

/** An opaque handle to a point-in-time EVM state, returned by `snapshot()`. */
export type SnapshotId = Hex;

export interface SetAccountParams {
  readonly address: Address;
  readonly balance?: bigint;
  readonly nonce?: bigint;
  readonly code?: Hex;
}

export interface MineParams {
  /** How many blocks to mine. Defaults to 1. */
  readonly blocks?: number;
  /** Seconds between the mined blocks. Defaults to 0. */
  readonly interval?: number;
}

export interface TestCheatcodes {
  readonly setBalance: (address: Address, value: bigint) => Promise<void>;
  readonly mine: (params?: MineParams) => Promise<void>;
  readonly setAccount: (params: SetAccountParams) => Promise<void>;
  /**
   * Capture EVM state. The id is consumed by the matching `revert`, so take a fresh
   * snapshot if you intend to restore the same point twice — `createFixture` does.
   */
  readonly snapshot: () => Promise<SnapshotId>;
  /** Restore a snapshot. Resolves `false` if the id was already consumed. */
  readonly revert: (id: SnapshotId) => Promise<boolean>;
}

/** Viem clients backed by a single in-memory EVM. Pass straight to a generated deployer. */
export interface TestClients {
  /** The primary prefunded account (`accounts[0]`), bound to `walletClient`. */
  readonly account: Account;
  /** Every prefunded account — use these to test multiple addresses interacting. */
  readonly accounts: TestAccounts;
  /** The in-memory chain — its name is what keys the `deployments/` records. */
  readonly chain: Chain;
  /** Wallet client bound to `account` (the first prefunded account). */
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  /**
   * Build a wallet client bound to any account (another prefunded one, or your own
   * funded account) on the SAME in-memory EVM — for multi-party tests:
   * `const alice = walletClientFor(accounts[1])`.
   */
  readonly walletClientFor: (account: Account) => WalletClient;
  /**
   * The raw provider, for anything the cheatcodes don't cover. Every `hardhat_*` /
   * `evm_*` method the underlying EVM supports is reachable through `request`.
   */
  readonly provider: TestProvider;
  /** Common EVM controls, as thin wrappers over the provider. */
  readonly cheatcodes: TestCheatcodes;
  /**
   * A fresh **in-memory** deployment store. Spread it into deploy calls
   * (`getOrDeployToken({ ...clients, args })`) so deploys never touch disk and vanish
   * with the test — no stale `deployments/` files, no cross-run reuse.
   */
  readonly store: StoreAdapter;
}

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

const cheatcodesFor = (provider: TestProvider): TestCheatcodes => {
  const send = (method: string, params: readonly unknown[]): Promise<unknown> =>
    provider.request({ method, params });

  const setBalance = async (address: Address, value: bigint): Promise<void> => {
    await send("hardhat_setBalance", [address, numberToHex(value)]);
  };

  return {
    setBalance,
    mine: async (params) => {
      await send("hardhat_mine", [
        numberToHex(BigInt(params?.blocks ?? 1)),
        numberToHex(BigInt(params?.interval ?? 0)),
      ]);
    },
    setAccount: async ({ address, balance, nonce, code }) => {
      // Each field is its own RPC; skip the ones the caller left out so we never
      // clobber existing state with a default.
      if (balance !== undefined) await setBalance(address, balance);
      if (nonce !== undefined) await send("hardhat_setNonce", [address, numberToHex(nonce)]);
      if (code !== undefined) await send("hardhat_setCode", [address, code]);
    },
    snapshot: async () => {
      const id = await send("evm_snapshot", []);
      if (typeof id !== "string") throw new Error("evm_snapshot did not return an id");
      return id as SnapshotId;
    },
    revert: async (id) => (await send("evm_revert", [id])) === true,
  };
};

/**
 * Spin up a real EVM ([EDR](https://github.com/NomicFoundation/edr), the engine behind
 * Hardhat 3) in-process and expose it as ordinary viem wallet/public clients — no
 * `hardhat node`, no anvil, no RPC. Hand the clients straight to a generated deployer:
 *
 * ```ts
 * const clients = await createTestClients();
 * // spread `clients` so deploys use the in-memory `store` — nothing hits disk
 * const { contract: token } = await getOrDeployToken({ ...clients, args: [owner] });
 * ```
 *
 * Deploys go to an in-memory `store` that's discarded when the test ends (no
 * `deployments/` files, no cross-run reuse). For multiple interacting addresses use
 * `accounts` + `walletClientFor`; fork a live chain with `{ fork: { url } }`.
 *
 * The return type is annotated with viem's portable client types on purpose, so the
 * emitted declarations stay nameable across the package boundary (TS2742).
 */
export const createTestClients = async (options?: CreateTestClientsOptions): Promise<TestClients> => {
  const { evmOptions, deployments, deploymentNetwork } = splitOptions(options);
  const evm = await createEvmProvider(evmOptions);
  const chain = chainFor(evmOptions.chainId ?? DEFAULT_CHAIN_ID);
  const provider: TestProvider = { request: requestFor(evm) };
  // The one unavoidable cast: EIP1193RequestFn is generic over each method's return
  // type, and a JSON-RPC string boundary can only promise `unknown`. It is narrowed
  // here, at the single point where the dynamic transport meets viem's typed schema.
  // retryCount: 0 — surface reverts immediately instead of viem's retry backoff.
  const transport = custom({ request: provider.request as EIP1193RequestFn }, { retryCount: 0 });

  const walletClientFor = (account: Account): WalletClient =>
    createWalletClient({ account, chain, transport });

  const accounts: TestAccounts = prefunded;
  const account = accounts[0];
  const seed = readDeploymentRecords(deployments, deploymentNetwork, chain);

  return {
    account,
    accounts,
    chain,
    walletClient: walletClientFor(account),
    publicClient: createPublicClient({ chain, transport }),
    walletClientFor,
    provider,
    cheatcodes: cheatcodesFor(provider),
    store: memoryStore(seed),
  };
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
