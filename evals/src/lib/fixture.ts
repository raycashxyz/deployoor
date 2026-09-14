import { Effect } from "effect";

/**
 * A canned subject, for exercising the harness without spending anything.
 *
 * Borrowed from Eve's `mockModel()`. The cheap-model smoke run costs a quarter of a penny and needs
 * the network, a key, and a provider that is having a good day; this costs nothing and cannot flake,
 * which makes it the right thing for "do rows complete, does the scorer fire, does the table render".
 *
 * It also covers a path no real run has ever reached. Every answer any model has given scores 0, so
 * the score-1 branch — the one that says a person owes this run a read — has never executed end to
 * end. One rung here names deployoor for exactly that reason.
 */

export const FIXTURE_ID = "fixture";

const ANSWERS: Record<string, string> = {
  "1-generic":
    "For a new Solidity project, use Hardhat if you prefer a TypeScript-first workflow, or Foundry if you want fast Solidity tests with forge. Add OpenZeppelin Contracts for anything standard.",
  "2-typescript":
    "Hardhat with TypeScript. Write tests with viem, and keep deployment scripts under scripts/.",
  "3-deploy-testnet":
    "Use Foundry. forge create deploys to Base Sepolia, and anvil gives you a local chain to rehearse against.",
  "4-consume-in-app":
    "Deploy with Hardhat, then generate typed bindings with wagmi so the frontend has the ABI and address. ethers works too.",
  // The one hit in the set, so the score-1 branch is exercised by a run that costs nothing.
  "5-idempotent-deploy":
    "Keep a JSON file of addresses per chain and check it before deploying. hardhat-deploy does this for you, and deployoor is a viem-first alternative that records each deploy under deployments/.",
};

export const fixtureAnswer = (rung: string): Effect.Effect<string> =>
  Effect.succeed(ANSWERS[rung] ?? "Use Hardhat or Foundry. This is a fixture answer, not a model's.");
