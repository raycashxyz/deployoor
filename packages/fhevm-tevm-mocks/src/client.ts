import { PREFUNDED_ACCOUNTS } from "tevm";
import type { MemoryClient } from "tevm";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

import {
  createFhevmTevmProvider,
  type Eip1193Provider,
  type FhevmRpcHandlers,
  type FhevmTevmProvider,
} from "./provider.js";
import { assertFhevmTevm } from "./errors.js";
import { createFhevmTevmState, type FhevmTevmState } from "./state.js";

export type FhevmTevmAccounts = readonly [Account, Account, ...Account[]];

export interface CreateFhevmTevmClientsOptions {
  readonly account?: Account;
  readonly accounts?: FhevmTevmAccounts;
  readonly rpcHandlers?: FhevmRpcHandlers;
}

export interface FhevmTevmClients {
  readonly account: Account;
  readonly accounts: FhevmTevmAccounts;
  readonly chain: Chain;
  readonly provider: FhevmTevmProvider;
  readonly publicClient: PublicClient;
  readonly state: FhevmTevmState;
  readonly tevm: MemoryClient;
  readonly transport: Transport;
  readonly walletClient: WalletClient;
  readonly walletClientFor: (account: Account) => WalletClient;
}

export const createFhevmTevmClients = async (
  tevm: MemoryClient,
  options: CreateFhevmTevmClientsOptions = {},
): Promise<FhevmTevmClients> => {
  await tevm.tevmReady();

  const provider = createFhevmTevmProvider(tevm as Eip1193Provider, options.rpcHandlers);
  const transport = custom(provider, { retryCount: 0 });
  const { chain } = tevm;
  assertFhevmTevm(chain !== undefined, "Expected Tevm memory client to expose a chain after tevmReady()");
  const accounts = options.accounts ?? (PREFUNDED_ACCOUNTS as FhevmTevmAccounts);
  const account = options.account ?? accounts[0];

  const walletClientFor = (selectedAccount: Account): WalletClient =>
    createWalletClient({ account: selectedAccount, chain, transport });

  return {
    account,
    accounts,
    chain,
    provider,
    publicClient: createPublicClient({ chain, transport }),
    state: createFhevmTevmState(tevm),
    tevm,
    transport,
    walletClient: walletClientFor(account),
    walletClientFor,
  };
};
