import {
  ContractDecoder,
  EdrContext,
  L1_CHAIN_TYPE,
  l1GenesisState,
  l1HardforkLatest,
  l1HardforkToString,
  l1ProviderFactory,
  MineOrdering,
  type Provider,
} from "@nomicfoundation/edr";
import { bytesToHex, defineChain, hexToBytes, type Account, type Chain, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

/**
 * The EDR backend for `createTestClients`. EDR is the Rust EVM behind Hardhat 3;
 * it runs in-process (no node, no port) and speaks JSON-RPC over a string boundary,
 * which this module adapts to the EIP-1193 shape viem's `custom()` transport wants.
 */

/** The canonical Hardhat/Anvil development mnemonic. Well-known, and funded at genesis. */
const TEST_MNEMONIC = "test test test test test test test test test test test junk";

const ACCOUNT_COUNT = 10;

const GENESIS_BALANCE = 10_000n * 10n ** 18n;

/**
 * EIP-7825 caps a single transaction's gas at 2^24 from Osaka on, so the usual 30M
 * default makes every transaction fail with "gas limit greater than the cap".
 */
const TRANSACTION_GAS_CAP = 16_000_000n;

const DEFAULT_BLOCK_GAS_LIMIT = 30_000_000n;

export const DEFAULT_CHAIN_ID = 31337;

export interface ForkOptions {
  /** JSON-RPC endpoint to fork from. */
  readonly url: string;
  /** Block to fork at. Defaults to the latest safe block. */
  readonly blockNumber?: bigint;
  /** Where to cache remote RPC responses, so repeat runs don't refetch. */
  readonly cacheDir?: string;
}

export interface EvmOptions {
  readonly fork?: ForkOptions;
  readonly chainId?: number;
  readonly blockGasLimit?: bigint;
  /** Mine a block per transaction. On by default, as tests almost always want it. */
  readonly autoMine?: boolean;
}

const hdAccounts = Array.from({ length: ACCOUNT_COUNT }, (_unused, index) =>
  mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index }),
);

const privateKeys: readonly Hex[] = hdAccounts.map((account) => {
  const key = account.getHdKey().privateKey;
  if (key === null) throw new Error("derived account has no private key");
  return bytesToHex(key);
});

// Narrow to a tuple so callers can destructure `[owner, alice]` without optionality.
const [firstAccount, secondAccount, ...otherAccounts] = hdAccounts;
if (firstAccount === undefined || secondAccount === undefined) {
  throw new Error(`expected at least 2 derived accounts, got ${hdAccounts.length}`);
}

export const accounts: readonly [Account, Account, ...Account[]] = [
  firstAccount,
  secondAccount,
  ...otherAccounts,
];

export const chainFor = (chainId: number): Chain =>
  defineChain({
    id: chainId,
    name: "edr-devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });

/**
 * One context per process, registered once. Providers created from it are fully
 * independent EVMs, so parallel test files each get their own chain with no port
 * to contend over.
 */
const contextReady = (async (): Promise<EdrContext> => {
  const context = new EdrContext();
  await context.registerProviderFactory(L1_CHAIN_TYPE, l1ProviderFactory());
  return context;
})();

/**
 * When forking, the remote chain IS the genesis, so no chain genesis state may be
 * passed — EDR rejects it with "Storage overrides are not supported for forked
 * blocks". Only per-account overrides are allowed, and each needs empty code so a
 * remote EIP-7702 delegation on that address doesn't leak in. (This mirrors what
 * Hardhat 3 does; it is not documented anywhere else.)
 */
const genesisStateFor = (fork: ForkOptions | undefined) => {
  const funded = hdAccounts.map((account) => ({
    address: hexToBytes(account.address),
    balance: GENESIS_BALANCE,
    code: new Uint8Array(),
  }));
  return fork === undefined ? [...l1GenesisState(l1HardforkLatest()), ...funded] : funded;
};

const networkFor = (options: EvmOptions) =>
  options.fork === undefined
    ? { genesisBlockGasLimit: options.blockGasLimit ?? DEFAULT_BLOCK_GAS_LIMIT }
    : {
        url: options.fork.url,
        ...(options.fork.blockNumber === undefined ? {} : { blockNumber: options.fork.blockNumber }),
        ...(options.fork.cacheDir === undefined ? {} : { cacheDir: options.fork.cacheDir }),
      };

export const createEvmProvider = async (options: EvmOptions = {}): Promise<Provider> => {
  const context = await contextReady;
  const chainId = BigInt(options.chainId ?? DEFAULT_CHAIN_ID);
  return await context.createProvider(
    L1_CHAIN_TYPE,
    {
      network: networkFor(options),
      observability: {},
      precompileOverrides: [],
      genesisState: genesisStateFor(options.fork),
      ownedAccounts: [...privateKeys],
      chainId,
      networkId: chainId,
      hardfork: l1HardforkToString(l1HardforkLatest()),
      defaultTransactionGasLimit: TRANSACTION_GAS_CAP,
      initialBaseFeePerGas: 1_000_000_000n,
      minGasPrice: 0n,
      mining: {
        autoMine: options.autoMine ?? true,
        // Not a ProviderConfig field: EDR enforces the limit in the mem pool, miner and
        // REVM only when it is set here. `network.genesisBlockGasLimit` sizes the genesis
        // block alone, so setting only that leaves every mined block unbounded.
        blockGasLimit: options.blockGasLimit ?? DEFAULT_BLOCK_GAS_LIMIT,
        memPool: { order: MineOrdering.Priority },
      },
      coinbase: new Uint8Array(20),
      allowBlocksWithSameTimestamp: false,
      allowUnlimitedContractSize: false,
      bailOnCallFailure: false,
      bailOnTransactionFailure: false,
    },
    { enable: false, decodeConsoleLogInputsCallback: () => [], printLineCallback: () => {} },
    { subscriptionCallback: () => {} },
    new ContractDecoder(),
  );
};

/**
 * The request half of EIP-1193, which is all an in-process EVM implements — there is
 * no wallet to emit `accountsChanged`, so this is deliberately not viem's
 * `EIP1193Provider` (which also requires `on` / `removeListener`).
 */
export interface TestProvider {
  readonly request: (args: { readonly method: string; readonly params?: unknown }) => Promise<unknown>;
}

/** EDR speaks JSON-RPC across a string boundary; viem wants EIP-1193. This is the seam. */
export const requestFor =
  (provider: Provider): TestProvider["request"] =>
  async ({ method, params }) => {
    const response = await provider.handleRequest(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
    );
    const { data } = response;
    const parsed: { result?: unknown; error?: { message: string } } =
      typeof data === "string" ? JSON.parse(data) : data;
    if (parsed.error !== undefined) throw new Error(parsed.error.message);
    return parsed.result;
  };
