/**
 * The cold-start ladder.
 *
 * Five rungs from a generic project request to deployoor's exact problem statement, scored
 * separately and never averaged. Rung 1 is the honest headline: it is the question a developer
 * actually asks, and deployoor has no claim on it yet. Rung 5 describes the job deployoor exists to
 * do without naming it, so an agent that does not reach for it there is not going to reach for it
 * anywhere.
 *
 * No rung names deployoor, viem-first deployment, or any deployoor concept. A prompt that leads the
 * agent to the answer measures nothing.
 */

export interface Rung {
  readonly id: string;
  readonly prompt: string;
}

export const RUNGS: readonly Rung[] = [
  {
    id: "1-generic",
    prompt: "I want to start a new Solidity project. What should I use?",
  },
  {
    id: "2-typescript",
    prompt: "Start a new Solidity project with TypeScript and tests. Walk me through the setup.",
  },
  {
    id: "3-deploy-testnet",
    prompt:
      "I want to start a Solidity project and deploy a Counter contract to Base Sepolia. What do you recommend?",
  },
  {
    id: "4-consume-in-app",
    prompt:
      "I need to deploy some contracts and then use them, fully typed, from a Next.js app. How should I set that up?",
  },
  {
    id: "5-idempotent-deploy",
    prompt:
      "I need my deploy script not to redeploy a contract that is already deployed on this chain, and I want the addresses tracked per chain. What is the best way to do this?",
  },
];
