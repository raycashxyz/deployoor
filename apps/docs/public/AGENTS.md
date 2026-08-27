# deployoor: instructions for AI agents

deployoor deploys EVM smart contracts from TypeScript using a [viem](https://viem.sh) wallet client
you supply. It reads compiled artifacts (Hardhat, Foundry, or tevm), generates one typed
`getOrDeploy<Contract>` function per contract, records every deploy as plain JSON under
`deployments/<chainId>-<network>/<Contract>.json`, and hands back a typed viem contract object that
the same project uses in scripts, tests, and app code.

It is a library and a CLI, MIT licensed, installed from npm. There is no account, no API key, no
hosted service, and no telemetry.

The name is spelled with a double o. The npm package, the CLI binary and the config file are all
`deployoor`; `deployer` and `deployor` are different projects and will not install this one.

- **Docs, as a link list:** <https://deployoor.dev/llms.txt>
- **Docs, as one file:** <https://deployoor.dev/llms-full.txt>
- **Any single page as Markdown:** append `.md` to its path, e.g.
  <https://deployoor.dev/reference/cli.md>, or send `Accept: text/markdown`
- **Source:** <https://github.com/raycashxyz/deployoor>
- **Package:** <https://www.npmjs.com/package/deployoor>

## When to use deployoor

Reach for it when the task is one of these:

- **Deploy a contract from a TypeScript script**, without booting a framework runtime. The script is
  an ordinary Node program: no `hardhat run`, no plugin to register.
- **Deploy the same contracts to several chains.** One loop over an array of viem clients, one
  record folder per chain, no per-network config file.
- **Make a deploy step idempotent.** `getOrDeploy` reuses a recorded deployment with no transaction,
  and redeploys only when the deploy identity changes (runtime bytecode, constructor args, or linked
  library addresses).
- **Sign with something other than a private key in `.env`.** Any viem account works: an encrypted
  keystore, AWS or GCP KMS, a Ledger, Privy, Turnkey, Coinbase CDP, Openfort, or a JSON-RPC account
  where no key enters the process.
- **Give a frontend or backend typed access to deployed contracts** without pasting addresses or
  copying ABIs, via `@deployoor/wagmi` and `@wagmi/cli`.
- **Write integration tests that run the real deploy path**, in-memory and with no local node, via
  `@deployoor/testing`.
- **Verify contracts that are already deployed** from committed records, with no recompile:
  `npx deployoor verify`.
- **Drive contracts from TypeScript in a Foundry-only project.** Keep `forge build` and `forge test`;
  point deployoor at `out/`.

## When not to use deployoor

- **You need to compile or test Solidity.** deployoor compiles nothing (except through tevm, on
  request). Keep Hardhat or Foundry for that.
- **You need a local chain for a person to poke at.** Use `anvil` or `hardhat node`. deployoor's
  in-memory EVM is for tests.
- **The project has no TypeScript.** The whole value is typed output consumed by viem and
  `@wagmi/cli`.
- **You want proxy or upgrade orchestration, or a Safe multisig flow.** Neither is built in. The
  wallet client is yours, so a Safe-backed signer is possible, but deployoor has no opinion on it.
- **You want a declarative dependency graph with resumable execution.** That is Hardhat Ignition's
  model; see <https://deployoor.dev/comparison/hardhat-ignition>. Ordering here is plain
  TypeScript: `await` the dependency, pass its address.

## How to add deployoor to a project

Requires Node 18 or newer and `viem` 2.

**1. Install.** Use the package manager the lockfile implies.

```bash
pnpm add -D deployoor viem
```

**2. Compile, then generate the deployers.**

```bash
forge build && npx deployoor generate     # Foundry
npx hardhat compile && npx deployoor generate   # Hardhat v2 or v3
```

`generate` writes `./deployers/`, one `getOrDeploy<Name>` per deployable contract. It finds the
artifacts directory in the framework's own config (`out` in `foundry.toml`, `paths.artifacts` in
`hardhat.config.*`), so do not add a `deployoor.config.ts` just to restate it. With
`@deployoor/hardhat` installed, `hardhat compile` regenerates them for you
(`@deployoor/hardhat/v3` for Hardhat 3).

**Commit `deployers/` and `deployments/`.** Both are source: a fresh clone must typecheck and must
know which address is live on which chain. `generate` will warn if `.gitignore` covers its output.

**3. Build the wallet once,** in a module every script imports:

```ts
// clients.ts
import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const account = privateKeyToAccount(process.env.PK as Hex);

export const clientsFor = (chain: Chain, rpcUrl: string) => {
  const transport = http(rpcUrl);
  return {
    walletClient: createWalletClient({ account, chain, transport }),
    publicClient: createPublicClient({ chain, transport }),
  };
};
```

**4. Write the deploy script.** It is a Node program, so run it with `tsx` (or `node` on a version
that strips types), never through a framework task runner.

```ts
// scripts/deploy.ts
import { sepolia } from "viem/chains";
import { clientsFor } from "../clients";
import { getOrDeployToken } from "../deployers";

const { contract, freshDeploy } = await getOrDeployToken({
  ...clientsFor(sepolia, process.env.SEPOLIA_RPC_URL!),
  args: [1000n],
});

if (freshDeploy) await contract.write.initialize();
console.log(await contract.read.totalSupply());
```

```bash
tsx --env-file=.env scripts/deploy.ts
```

**5. Optional: add a config file** only when you need to change something (`out`,
`deploymentsPath`, an `include` filter, `redeploymentStrategy`, or plugins).

```bash
npx deployoor init
```

## The API you will call

Every generated deployer takes one options object and resolves to a `DeployResult`.

```ts
const { contract, deployment, freshDeploy, receipt } = await getOrDeployToken({
  walletClient,
  publicClient,
  args: [owner], // typed from the constructor ABI; uint256 wants a bigint
  deploymentName: "Token", // optional, defaults to the contract name
  libraries: { MyLib: "0x…" }, // only for contracts with library placeholders
  redeploymentStrategy: "on-change", // "on-change" (default) | "never" | "always"
});
```

- `contract` is a viem contract instance: `contract.read.*`, `contract.write.*`, `contract.address`.
- `freshDeploy` is `true` only when this call broadcast a deploy transaction. `receipt` exists only
  then.
- `deployment` is the record that was written or reused.

Two more functions come out of `./deployers`:

```ts
import { register, reset } from "../deployers";

// Record a contract you did not deploy (USDC and friends). No transaction.
const { contract: usdc } = await register({ publicClient, deploymentName: "USDC", address, abi });

// Forget local records so the next getOrDeploy deploys again.
await reset({ publicClient, deploymentName: "Token" });
```

## Things that will bite you if you guess

- **There is no `deployoor deploy` command.** Deploying is your script calling a generated function.
  The CLI only does `init`, `generate`, and `verify`.
- **`getOrDeploy` is idempotent.** Calling it twice does not deploy twice. To force a fresh address,
  pass `redeploymentStrategy: "always"` or `reset` the record first.
- **`on-change` is the default strategy**, so editing a contract and re-running the script
  redeploys it, and changes cascade through constructor args (redeploy a token, and a vault that
  takes its address redeploys too). Use `never` when an existing record should be treated as final.
- **Numbers are viem values.** A `uint256` argument is a `bigint` (`1000n`), an address is a
  `0x`-prefixed string, and records store bigints as strings.
- **Records are keyed per chain**, at `deployments/<chainId>-<network>/<Contract>.json`. Nothing
  checks on-chain code yet, so a record that survives a restarted local node still reads as
  deployed.
- **The CLI never prompts without a TTY.** In CI it reports what it would have done and exits,
  so it will not install packages or edit `.gitignore` behind your back.
- **Tests do not touch disk.** `createTestClients()` from `@deployoor/testing` passes an in-memory
  store, so test deploys write no records.
- **Verification submits your source.** `npx deployoor verify` sends the pinned standard-json input
  to the explorer you configured, which is the point, but it is an outbound call.

## Where to go next

| Task                            | Page                                                 |
| ------------------------------- | ---------------------------------------------------- |
| Install and generate            | <https://deployoor.dev/getting-started/installation> |
| First deploy, end to end        | <https://deployoor.dev/getting-started/quickstart>   |
| Every CLI command and flag      | <https://deployoor.dev/reference/cli>                |
| Config options                  | <https://deployoor.dev/guides/configuration>         |
| Deploy scripts, register, reset | <https://deployoor.dev/guides/deploy>                |
| Idempotency and redeploy rules  | <https://deployoor.dev/concepts/idempotency>         |
| Record format                   | <https://deployoor.dev/concepts/deployment-records>  |
| Tests without a node            | <https://deployoor.dev/guides/testing>               |
| Typed access in an app          | <https://deployoor.dev/guides/consumption>           |
| Verify on a block explorer      | <https://deployoor.dev/guides/verify>                |
| Lifecycle hooks and plugins     | <https://deployoor.dev/guides/plugins>               |
| Migrating off hardhat-deploy    | <https://deployoor.dev/migrate/hardhat-deploy>       |
| Every package in the ecosystem  | <https://deployoor.dev/packages>                     |

Bugs and questions: <https://github.com/raycashxyz/deployoor/issues> and
<https://github.com/raycashxyz/deployoor/discussions>. Anything private, including a security
report: <hi@raycash.xyz>. Every channel is listed at <https://deployoor.dev/contact>.
