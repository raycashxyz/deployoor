import { createMemoryClient, PREFUNDED_ACCOUNTS } from "tevm";
import type { DumpStateResult, LoadStateResult, MemoryClient, MineParams, SetAccountParams } from "tevm";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createWalletClient, createPublicClient, custom } from "viem";
import type { Account, Address, Chain, PublicClient, WalletClient } from "viem";
import {
  DeploymentRecord,
  memoryStore,
  networkKeyForChain,
  type ChainIdentity,
  type StoreAdapter,
  type DeploymentRecord as DeploymentRecordType,
} from "deployoor";

/**
 * Options for the in-memory EVM, passed straight through to tevm's `createMemoryClient`
 * (e.g. `fork`, `miningConfig`, `common`, `loggingLevel`). Mining defaults to `"auto"`
 * unless you override it here.
 */
type TevmOptions = Parameters<typeof createMemoryClient>[0];
type BaseTevmOptions = NonNullable<TevmOptions>;
type SerializableState = DumpStateResult["state"];

export type TestAccounts = readonly [Account, Account, ...Account[]];

export type CreateTestClientsOptions = BaseTevmOptions & {
  /**
   * Seed the in-memory deployment store from committed production/testnet records.
   * Pass a deployments/ path or records. With `deploymentNetwork`, matching records
   * are remapped to the in-memory chain so `getOrDeploy` reuses them in fork tests.
   */
  readonly deployments?: string | ReadonlyArray<DeploymentRecordType>;
  /** Source network folder/key to load when `deployments` is a path (e.g. "1-ethereum"). */
  readonly deploymentNetwork?: string;
};

export interface TestCheatcodes {
  readonly setBalance: (address: Address, value: bigint) => Promise<void>;
  readonly deal: (params: {
    readonly account: Address;
    readonly amount: bigint;
    readonly erc20?: Address;
  }) => Promise<void>;
  readonly mine: (params?: MineParams) => Promise<void>;
  readonly setAccount: (params: SetAccountParams) => Promise<void>;
  readonly dumpState: () => Promise<SerializableState>;
  readonly loadState: (state: SerializableState) => Promise<void>;
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
  /** The underlying tevm memory client for advanced EVM control. */
  readonly tevm: MemoryClient;
  /** Common EVM controls backed by tevm actions. */
  readonly cheatcodes: TestCheatcodes;
  /**
   * A fresh **in-memory** deployment store. Spread it into deploy calls
   * (`getOrDeployToken({ ...clients, args })`) so deploys never touch disk and vanish
   * with the test — no stale `deployments/` files, no cross-run reuse.
   */
  readonly store: StoreAdapter;
}

/**
 * Spin up a real EVM ([tevm](https://tevm.sh)) in-process and expose it as ordinary
 * viem wallet/public clients — no `hardhat node`, no anvil, no RPC. Hand the clients
 * straight to a generated deployer:
 *
 * ```ts
 * const clients = await createTestClients();
 * // spread `clients` so deploys use the in-memory `store` — nothing hits disk
 * const token = await getOrDeployToken({ ...clients, args: [owner] });
 * ```
 *
 * Deploys go to an in-memory `store` that's discarded when the test ends (no
 * `deployments/` files, no cross-run reuse). For multiple interacting addresses use
 * `accounts` + `walletClientFor`; pass tevm options (fork, mining, …) via the argument.
 *
 * The return type is annotated with viem's portable client types on purpose: the
 * inferred tevm chain type pulls in `@ethereumjs/common`, which isn't nameable across
 * the package boundary under `declaration: true` (TS2742).
 */
const assertNoErrors = (result: { readonly errors?: readonly unknown[] }): void => {
  if (result.errors !== undefined && result.errors.length > 0) {
    throw new Error(String(result.errors[0]));
  }
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
  readonly tevmOptions: TevmOptions | undefined;
  readonly deployments: string | ReadonlyArray<DeploymentRecordType> | undefined;
  readonly deploymentNetwork: string | undefined;
} => {
  if (options === undefined) {
    return { tevmOptions: undefined, deployments: undefined, deploymentNetwork: undefined };
  }
  const { deployments, deploymentNetwork, ...tevmOptions } = options;
  return { tevmOptions, deployments, deploymentNetwork };
};

export const createTestClients = async (options?: CreateTestClientsOptions): Promise<TestClients> => {
  const { tevmOptions, deployments, deploymentNetwork } = splitOptions(options);
  // Default to auto-mining, but let the caller override anything (incl. miningConfig).
  const memory = createMemoryClient({ miningConfig: { type: "auto" }, ...tevmOptions });
  await memory.tevmReady();
  const { chain } = memory;
  // retryCount: 0 — surface reverts immediately instead of viem's retry backoff.
  const transport = custom(memory, { retryCount: 0 });

  const walletClientFor = (account: Account): WalletClient =>
    createWalletClient({ account, chain, transport });

  const accounts = PREFUNDED_ACCOUNTS as TestAccounts;
  const account = accounts[0];
  const seed = readDeploymentRecords(deployments, deploymentNetwork, chain);
  const cheatcodes: TestCheatcodes = {
    setBalance: async (address, value) => {
      const result = await memory.tevmDeal({ account: address, amount: value });
      assertNoErrors(result);
    },
    deal: async (params) => {
      const result = await memory.tevmDeal(params);
      assertNoErrors(result);
    },
    mine: async (params) => {
      const result = await memory.tevmMine(params);
      assertNoErrors(result);
    },
    setAccount: async (params) => {
      const result = await memory.tevmSetAccount(params);
      assertNoErrors(result);
    },
    dumpState: async () => {
      const result = await memory.tevmDumpState();
      assertNoErrors(result);
      return result.state;
    },
    loadState: async (state) => {
      const result: LoadStateResult = await memory.tevmLoadState({ state });
      assertNoErrors(result);
    },
  };

  return {
    account,
    accounts,
    chain,
    walletClient: walletClientFor(account),
    publicClient: createPublicClient({ chain, transport }),
    walletClientFor,
    tevm: memory,
    cheatcodes,
    store: memoryStore(seed),
  };
};

/**
 * Hardhat-style fixture helper backed by tevmDumpState/tevmLoadState.
 * The first call runs `setup` and snapshots EVM state; later calls restore it.
 */
export const createFixture = <T>(
  setup: (clients: TestClients) => Promise<T> | T,
): ((clients: TestClients) => Promise<T>) => {
  let cached: { readonly state: SerializableState; readonly value: T } | undefined;
  return async (clients) => {
    if (cached === undefined) {
      const value = await setup(clients);
      cached = { value, state: await clients.cheatcodes.dumpState() };
      return value;
    }
    await clients.cheatcodes.loadState(cached.state);
    return cached.value;
  };
};
