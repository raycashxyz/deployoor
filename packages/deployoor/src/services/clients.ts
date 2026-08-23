import { Context, Effect, Layer } from "effect";
import { getContract, zeroAddress } from "viem";
import type {
  Abi,
  Account,
  Address,
  Chain,
  GetContractReturnType,
  Hash,
  Hex,
  PublicClient,
  TransactionReceipt,
  Transport,
  WalletClient,
} from "viem";
import { NoChainOnClient } from "../errors";
import type { DeploymentRecord } from "../schemas";

/**
 * A wallet client with `chain` and `account` both bound — the only shape the engine ever
 * runs on, since `clientsLayer` fails with `NoChainOnClient` otherwise. Saying so in the
 * type is what lets `contract.write.foo(args)` be called with one argument: viem derives
 * that from the client, requiring an explicit `{ account, chain }` whenever either could
 * be `undefined`, which is exactly what bare `WalletClient` declares (its defaults are
 * `Chain | undefined` / `Account | undefined`).
 */
export type BoundWalletClient = WalletClient<Transport, Chain, Account>;

/** The runtime side of `BoundWalletClient`, as a guard so the narrowing reaches `contractAt`. */
const isBoundWalletClient = (client: WalletClient): client is BoundWalletClient =>
  client.chain !== undefined && client.account !== undefined;

export type DeployedContract<A extends Abi> = GetContractReturnType<
  A,
  { public: PublicClient; wallet: BoundWalletClient }
>;

/**
 * The same contract without `write`: what `register` resolves to when called with no wallet
 * client, because viem's `getContract` emits no `write` namespace for a public client alone.
 */
export type ReadOnlyContract<A extends Abi> = Omit<DeployedContract<A>, "write">;

/**
 * What a generated `getOrDeploy<Name>` / `register` resolves to — more than just the
 * contract, so a deploy script can branch on what actually happened:
 *   - `contract`     — the typed viem object (`.read.*` / `.write.*` / `.address`).
 *   - `deployment`   — the full record (address, chainId, tx, compiler, …).
 *   - `freshDeploy`  — `true` only when this call broadcast a deploy transaction;
 *                      `false` on idempotent reuse and for `register` (which never deploys).
 *   - `receipt`      — the deploy receipt, present only when `freshDeploy` is `true`.
 *
 * `contract` is writable by default; `register` without a wallet client narrows it to
 * `ReadOnlyContract`.
 */
export interface DeployResult<A extends Abi, contract = DeployedContract<A>> {
  readonly contract: contract;
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
    readonly bytecode: Hex;
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
      if (!isBoundWalletClient(walletClient)) return yield* Effect.fail(new NoChainOnClient());
      const { chain, account } = walletClient;
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
        // `ClientsService` is one shape for both paths, so this widens to the writable
        // contract type — the only place in the engine that does. Whether `write` is really
        // there is a property of the arguments, not of the chain, so `register`'s public
        // overloads carry it instead: with a wallet client they promise `DeployedContract`,
        // without one only `ReadOnlyContract`.
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
