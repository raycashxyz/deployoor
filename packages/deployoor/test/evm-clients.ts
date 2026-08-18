import {
  ContractDecoder,
  EdrContext,
  L1_CHAIN_TYPE,
  l1GenesisState,
  l1HardforkLatest,
  l1HardforkToString,
  l1ProviderFactory,
  MineOrdering,
} from "@nomicfoundation/edr";
import {
  createWalletClient,
  createPublicClient,
  custom,
  defineChain,
  hexToBytes,
  type Account,
  type Address,
  type EIP1193RequestFn,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * A real, in-process EVM (EDR — the Rust engine behind Hardhat 3) exposed as
 * ordinary viem wallet/public clients. Used by every deploy test — no fake clients.
 *
 * This deliberately duplicates a slice of `@deployoor/testing`'s `src/edr.ts` rather
 * than importing it: `@deployoor/testing` depends on `deployoor`, so the reverse edge
 * is a package cycle that turbo rejects outright ("Circular package dependency
 * detected"). Keep the two configs in step by hand.
 *
 * The return type is annotated with viem's portable client types so the emitted
 * declarations stay nameable across pnpm's layout under `declaration: true` (TS2742).
 */

/** The canonical Hardhat/Anvil development keys. Well-known and funded at genesis. */
const PREFUNDED_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;

const CHAIN_ID = 31337;

const GENESIS_BALANCE = 10_000n * 10n ** 18n;

/**
 * EIP-7825 caps a single transaction's gas at 2^24 on the latest hardfork, so the
 * usual 30M default makes every transaction fail with "gas limit greater than the cap".
 */
const TRANSACTION_GAS_CAP = 16_000_000n;

const BLOCK_GAS_LIMIT = 30_000_000n;

const chain = defineChain({
  id: CHAIN_ID,
  name: "edr-devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

const accounts: readonly Account[] = PREFUNDED_PRIVATE_KEYS.map((key) => privateKeyToAccount(key));

/**
 * One context per process, registered once. Providers created from it are independent
 * EVMs, so parallel test files each get their own chain without contending for a port.
 */
const contextReady = (async (): Promise<EdrContext> => {
  const context = new EdrContext();
  await context.registerProviderFactory(L1_CHAIN_TYPE, l1ProviderFactory());
  return context;
})();

const genesisState = () => [
  ...l1GenesisState(l1HardforkLatest()),
  ...accounts.map((account) => ({
    address: hexToBytes(account.address),
    balance: GENESIS_BALANCE,
  })),
];

const providerConfig = () => ({
  network: { genesisBlockGasLimit: BLOCK_GAS_LIMIT },
  observability: {},
  precompileOverrides: [],
  genesisState: genesisState(),
  ownedAccounts: [...PREFUNDED_PRIVATE_KEYS],
  chainId: BigInt(CHAIN_ID),
  networkId: BigInt(CHAIN_ID),
  hardfork: l1HardforkToString(l1HardforkLatest()),
  defaultTransactionGasLimit: TRANSACTION_GAS_CAP,
  initialBaseFeePerGas: 1_000_000_000n,
  minGasPrice: 0n,
  mining: {
    autoMine: true,
    // Not a ProviderConfig field: EDR enforces the limit in the mem pool, miner and
    // REVM only when it is set here. `network.genesisBlockGasLimit` sizes the genesis
    // block alone, so setting only that leaves every mined block unbounded.
    blockGasLimit: BLOCK_GAS_LIMIT,
    memPool: { order: MineOrdering.Priority },
  },
  coinbase: new Uint8Array(20),
  allowBlocksWithSameTimestamp: false,
  allowUnlimitedContractSize: false,
  bailOnCallFailure: false,
  bailOnTransactionFailure: false,
});

export const makeEvmClients = async (): Promise<{
  account: Account;
  address: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
}> => {
  const context = await contextReady;
  const provider = await context.createProvider(
    L1_CHAIN_TYPE,
    providerConfig(),
    { enable: false, decodeConsoleLogInputsCallback: () => [], printLineCallback: () => {} },
    { subscriptionCallback: () => {} },
    new ContractDecoder(),
  );

  // EDR speaks JSON-RPC over a string boundary; viem wants EIP-1193. This is the seam.
  const request = async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    const response = await provider.handleRequest(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
    );
    const { data } = response;
    // JSON.parse is `any`; annotate the shape rather than reading through it blind.
    const parsed: { result?: unknown; error?: { message: string } } =
      typeof data === "string" ? JSON.parse(data) : data;
    if (parsed.error !== undefined) throw new Error(parsed.error.message);
    return parsed.result;
  };

  const account = accounts[0];
  if (account === undefined) throw new Error("no prefunded accounts");
  // retryCount: 0 — fail fast on reverts instead of viem's retry backoff (keeps the
  // failed-deploy test quick and deterministic).
  // EIP1193RequestFn is generic over each method's return type, and a JSON-RPC string
  // boundary can only promise `unknown`. Narrowed here, where the dynamic transport
  // meets viem's typed schema, and nowhere else.
  const transport = custom({ request: request as EIP1193RequestFn }, { retryCount: 0 });
  return {
    account,
    address: account.address,
    walletClient: createWalletClient({ account, chain, transport }),
    publicClient: createPublicClient({ chain, transport }),
  };
};
