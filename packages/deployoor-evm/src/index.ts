import {
  createPublicClient,
  createWalletClient,
  custom,
  isHex,
  numberToHex,
  type EIP1193RequestFn,
} from "viem";
import type { Account, Address, Chain, Hex, PublicClient, WalletClient } from "viem";
import {
  accounts,
  chainFor,
  createEvmProvider,
  DEFAULT_CHAIN_ID,
  requestFor,
  type EvmOptions,
  type EvmProvider,
} from "./node";

export type { EvmOptions, EvmProvider, ForkOptions } from "./node";
export { accounts, DEFAULT_CHAIN_ID } from "./node";

/**
 * A real EVM in the current process, exposed as ordinary viem clients.
 *
 * Private to this monorepo on purpose: it is bundled into `@deployoor/testing` and
 * imported directly by `deployoor`'s own tests, which is the whole reason it exists.
 * `deployoor` cannot depend on `@deployoor/testing` — that closes a package cycle
 * turbo rejects — so the shared half lives here, where neither side needs the other.
 */

export type EvmAccounts = readonly [Account, Account, ...Account[]];

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

export interface Cheatcodes {
  readonly setBalance: (address: Address, value: bigint) => Promise<void>;
  readonly mine: (params?: MineParams) => Promise<void>;
  readonly setAccount: (params: SetAccountParams) => Promise<void>;
  /**
   * Capture EVM state. The id is consumed by the matching `revert`, so take a fresh
   * snapshot if you intend to restore the same point twice.
   */
  readonly snapshot: () => Promise<SnapshotId>;
  /** Restore a snapshot. Resolves `false` if the id was already consumed. */
  readonly revert: (id: SnapshotId) => Promise<boolean>;
}

export interface EvmNode {
  /** The primary prefunded account (`accounts[0]`), bound to `walletClient`. */
  readonly account: Account;
  /** Every prefunded account — use these to test multiple addresses interacting. */
  readonly accounts: EvmAccounts;
  readonly chain: Chain;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  /** A wallet client bound to any account on this same EVM. */
  readonly walletClientFor: (account: Account) => WalletClient;
  /** The raw provider, for any RPC the cheatcodes don't wrap. */
  readonly provider: EvmProvider;
  readonly cheatcodes: Cheatcodes;
}

const cheatcodesFor = (provider: EvmProvider): Cheatcodes => {
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
      // Narrowed with a guard rather than cast: the RPC boundary hands back `unknown`,
      // and a SnapshotId is only useful if it really is the hex quantity `evm_revert`
      // expects back.
      const id = await send("evm_snapshot", []);
      if (!isHex(id)) throw new Error(`evm_snapshot returned ${JSON.stringify(id)}, expected a hex id`);
      return id;
    },
    revert: async (id) => (await send("evm_revert", [id])) === true,
  };
};

/**
 * Boot an in-memory EVM and wrap it in viem clients. The return type is annotated with
 * viem's portable client types on purpose, so the emitted declarations stay nameable
 * across the package boundary (TS2742).
 */
export const createEvmNode = async (options: EvmOptions = {}): Promise<EvmNode> => {
  const evm = await createEvmProvider(options);
  const chain = chainFor(options.chainId ?? DEFAULT_CHAIN_ID);
  const provider: EvmProvider = { request: requestFor(evm) };
  // The one unavoidable cast: EIP1193RequestFn is generic over each method's return
  // type, and a JSON-RPC string boundary can only promise `unknown`. It is narrowed
  // here, at the single point where the dynamic transport meets viem's typed schema.
  // retryCount: 0 — surface reverts immediately instead of viem's retry backoff.
  const transport = custom({ request: provider.request as EIP1193RequestFn }, { retryCount: 0 });

  const walletClientFor = (account: Account): WalletClient =>
    createWalletClient({ account, chain, transport });

  const account = accounts[0];
  return {
    account,
    accounts,
    chain,
    walletClient: walletClientFor(account),
    publicClient: createPublicClient({ chain, transport }),
    walletClientFor,
    provider,
    cheatcodes: cheatcodesFor(provider),
  };
};
