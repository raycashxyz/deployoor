import { Context, Effect, Layer } from "effect";
import { getContract } from "viem";
import type {
  Abi,
  Address,
  Chain,
  GetContractReturnType,
  Hash,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from "viem";
import { NoChainOnClient } from "../errors";

export type DeployedContract<A extends Abi> = GetContractReturnType<
  A,
  { public: PublicClient; wallet: WalletClient }
>;

/**
 * The narrow chain capability the engine needs. viem's heavily-overloaded
 * client methods are adapted into this clean shape ONCE (in `clientsLayer`),
 * which keeps the pipeline readable and trivially fakeable in tests.
 */
export interface ClientsService {
  readonly chain: Chain;
  readonly account: Address;
  readonly deploy: (input: {
    readonly abi: Abi;
    readonly bytecode: `0x${string}`;
    readonly args: readonly unknown[];
  }) => Promise<Hash>;
  readonly waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
  readonly contractAt: <A extends Abi>(address: Address, abi: A) => DeployedContract<A>;
}

export class Clients extends Context.Tag("deployoor/Clients")<Clients, ClientsService>() {}

export const clientsLayer = (
  walletClient: WalletClient,
  publicClient: PublicClient,
): Layer.Layer<Clients, NoChainOnClient> =>
  Layer.effect(
    Clients,
    Effect.gen(function* () {
      const chain = walletClient.chain;
      const account = walletClient.account;
      if (chain === undefined || account === undefined) {
        return yield* Effect.fail(new NoChainOnClient());
      }
      return {
        chain,
        account: account.address,
        deploy: ({ abi, bytecode, args }) =>
          walletClient.deployContract({ abi, bytecode, args, account, chain }),
        waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
        contractAt: (address, abi) =>
          getContract({ address, abi, client: { public: publicClient, wallet: walletClient } }),
      } satisfies ClientsService;
    }),
  );
