import { createMemoryClient, PREFUNDED_ACCOUNTS } from "tevm";
import {
  createWalletClient,
  createPublicClient,
  custom,
  type Account,
  type WalletClient,
  type PublicClient,
} from "viem";

/**
 * A real, in-process EVM (tevm) exposed as ordinary viem wallet/public clients.
 * Used by every deploy test — no fake clients.
 *
 * The return type is annotated with viem's portable client types: the inferred
 * types pull in tevm's chain (→ @ethereumjs/common), which isn't nameable across
 * pnpm's layout under `declaration: true` (TS2742).
 */
export const makeEvmClients = async (): Promise<{
  account: Account;
  address: `0x${string}`;
  walletClient: WalletClient;
  publicClient: PublicClient;
}> => {
  const memory = createMemoryClient({ miningConfig: { type: "auto" } });
  await memory.tevmReady();
  const account = PREFUNDED_ACCOUNTS[0];
  // retryCount: 0 — fail fast on reverts instead of viem's retry backoff (keeps the
  // failed-deploy test quick and deterministic).
  const transport = custom(memory, { retryCount: 0 });
  return {
    account,
    address: account.address,
    walletClient: createWalletClient({ account, chain: memory.chain, transport }),
    publicClient: createPublicClient({ chain: memory.chain, transport }),
  };
};
