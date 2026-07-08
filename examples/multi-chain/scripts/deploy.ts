// Deploy Ping (Sepolia) and Pong (Base Sepolia) in one script — two viem clients, one file.
//
//   cp .env.example .env
//   pnpm --filter @example/multi-chain generate
//   pnpm --filter @example/multi-chain deploy
import { type Address, type Chain, createPublicClient, createWalletClient, http, pad } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";
import { getOrDeployPing, getOrDeployPong } from "../deployers";

/** LayerZero V2 testnet endpoint (same address on Sepolia and Base Sepolia). */
const LZ_ENDPOINT = "0x6EDCE65408990e3A38e31dE08b74da7D5258d898" as const;

/** LayerZero endpoint IDs — https://docs.layerzero.network/v2/deployments/deployed-contracts */
const LZ_EID = {
  sepolia: 40_161,
  baseSepolia: 40_245,
} as const;

function peerAddress(address: Address): `0x${string}` {
  return pad(address, { size: 32 });
}

function clientsFor(chain: Chain, rpcUrl: string, privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  return {
    walletClient: createWalletClient({ account, chain, transport }),
    publicClient: createPublicClient({ chain, transport }),
  };
}

const main = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Set PRIVATE_KEY in .env (see .env.example).");

  const sepoliaRpc = process.env.SEPOLIA_RPC_URL;
  const baseRpc = process.env.BASE_SEPOLIA_RPC_URL;
  if (!sepoliaRpc || !baseRpc) {
    throw new Error("Set SEPOLIA_RPC_URL and BASE_SEPOLIA_RPC_URL in .env.");
  }

  const sepoliaClients = clientsFor(sepolia, sepoliaRpc, privateKey as `0x${string}`);
  const baseClients = clientsFor(baseSepolia, baseRpc, privateKey as `0x${string}`);

  // Same deployer function, different clients → different chain, different deployments/ record folder.
  const { contract: ping, freshDeploy: pingFresh } = await getOrDeployPing({
    ...sepoliaClients,
    args: [LZ_ENDPOINT],
  });

  const { contract: pong, freshDeploy: pongFresh } = await getOrDeployPong({
    ...baseClients,
    args: [LZ_ENDPOINT],
  });

  console.log(
    pingFresh ? `Deployed Ping on Sepolia at ${ping.address}` : `Ping already on Sepolia at ${ping.address}`,
  );
  console.log(
    pongFresh
      ? `Deployed Pong on Base Sepolia at ${pong.address}`
      : `Pong already on Base Sepolia at ${pong.address}`,
  );

  // Wire LayerZero peers — bytes32-encoded remote contract addresses.
  const pingPeerTx = await ping.write.setPeer([LZ_EID.baseSepolia, peerAddress(pong.address)]);
  const pongPeerTx = await pong.write.setPeer([LZ_EID.sepolia, peerAddress(ping.address)]);

  console.log(`Linked peers (Ping → Base): ${pingPeerTx}`);
  console.log(`Linked peers (Pong → Sepolia): ${pongPeerTx}`);
  console.log("\nRecords written under:");
  console.log("  deployments/11155111-sepolia/Ping.json");
  console.log("  deployments/84532-base-sepolia/Pong.json");
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
