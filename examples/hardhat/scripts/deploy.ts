// Deploy Counter with a real signer over a real RPC, recording the result to `deployments/`.
// The same generated `getOrDeployCounter` the test uses against an in-memory EVM — here it
// talks to whatever RPC + key you point it at (a local anvil by default; a testnet via .env).
//
//   cp .env.example .env       # then set RPC_URL / PRIVATE_KEY
//   pnpm --filter @example/hardhat deploy
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { getOrDeployCounter } from "../deployers";

const main = async (): Promise<void> => {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const privateKey = process.env.PRIVATE_KEY;
  if (privateKey === undefined) throw new Error("Set PRIVATE_KEY (copy .env.example to .env).");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(rpcUrl);
  const walletClient = createWalletClient({ account, chain: foundry, transport });
  const publicClient = createPublicClient({ chain: foundry, transport });

  // getOrDeploy is idempotent: first run deploys + records; later runs return the recorded
  // contract with no transaction. `freshDeploy` lets a deploy script run one-time setup only
  // when it actually deployed.
  const { contract, freshDeploy, receipt } = await getOrDeployCounter({
    walletClient,
    publicClient,
    args: [7n],
  });

  console.log(
    freshDeploy
      ? `Deployed Counter at ${contract.address} (tx ${receipt?.transactionHash})`
      : `Counter already recorded at ${contract.address} — no transaction sent`,
  );
  if (freshDeploy) {
    // one-time initialization would go here — only runs on a real deploy
    await contract.write.setNumber([42n]);
  }
  console.log(`number() = ${await contract.read.number()}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
