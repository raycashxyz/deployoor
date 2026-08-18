import { createEvmNode } from "@deployoor/evm";
import type { Account, Address, WalletClient, PublicClient } from "viem";

/**
 * A real, in-process EVM (EDR — the Rust engine behind Hardhat 3) exposed as
 * ordinary viem wallet/public clients. Used by every deploy test — no fake clients.
 *
 * The EVM comes from `@deployoor/evm`, the private package that also backs
 * `@deployoor/testing`. It exists precisely so this file and that package share one
 * implementation: `@deployoor/testing` depends on `deployoor`, so importing it from
 * here would close a package cycle that turbo rejects.
 *
 * The return type is annotated with viem's portable client types so the emitted
 * declarations stay nameable across pnpm's layout under `declaration: true` (TS2742).
 */
export const makeEvmClients = async (): Promise<{
  account: Account;
  address: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
}> => {
  const { account, walletClient, publicClient } = await createEvmNode();
  return { account, address: account.address, walletClient, publicClient };
};
