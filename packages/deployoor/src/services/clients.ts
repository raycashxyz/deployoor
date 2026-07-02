import { Context, Effect, Layer } from "effect";
import { getContract, zeroAddress } from "viem";
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
import type { DeploymentRecord } from "../schemas";

export type DeployedContract<A extends Abi> = GetContractReturnType<
  A,
  { public: PublicClient; wallet: WalletClient }
>;

/**
 * What a generated `getOrDeploy<Name>` / `register` resolves to — more than just the
 * contract, so a deploy script can branch on what actually happened:
 *   - `contract`     — the typed viem object (`.read.*` / `.write.*` / `.address`).
 *   - `deployment`   — the full record (address, chainId, tx, compiler, …).
 *   - `freshDeploy`  — `true` only when this call broadcast a deploy transaction;
 *                      `false` on idempotent reuse and for `register` (which never deploys).
 *   - `receipt`      — the deploy receipt, present only when `freshDeploy` is `true`.
 */
export interface DeployResult<A extends Abi> {
  readonly contract: DeployedContract<A>;
  readonly deployment: DeploymentRecord;
  readonly freshDeploy: boolean;
  readonly receipt?: TransactionReceipt;
}

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

/**
 * Clients for `register`, which records an already-deployed / external address and never
 * broadcasts a transaction — so a public client (for the chain) is all it needs. The wallet
 * client is optional: pass one to record it as the registrant and get a writable contract
 * back; omit it and the deployer is recorded as the zero address and the contract is
 * read-only. `deploy` / `waitForReceipt` are never reached on the register path.
 */
export const registerClientsLayer = (
  publicClient: PublicClient,
  walletClient?: WalletClient,
): Layer.Layer<Clients, NoChainOnClient> =>
  Layer.effect(
    Clients,
    Effect.gen(function* () {
      const chain = walletClient?.chain ?? publicClient.chain;
      if (chain === undefined) return yield* Effect.fail(new NoChainOnClient());
      const notDeploying = (): never => {
        throw new Error("register records an existing address and never deploys");
      };
      return {
        chain,
        account: walletClient?.account?.address ?? zeroAddress,
        deploy: notDeploying,
        waitForReceipt: notDeploying,
        contractAt: (address, abi) =>
          (walletClient === undefined
            ? getContract({ address, abi, client: publicClient })
            : getContract({
                address,
                abi,
                client: { public: publicClient, wallet: walletClient },
              })) as DeployedContract<typeof abi>,
      } satisfies ClientsService;
    }),
  );
