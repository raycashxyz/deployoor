/**
 * Scoring for the cold-start eval.
 *
 * The rubric is a four-level ordinal: **chosen** (named in the final recommendation as the thing to
 * use), **offered** (presented among options), **mentioned** (appears without being recommended),
 * **absent**. Only the last of those is decided here. Everything that names deployoor at all is read
 * by a person in the evalite UI, because the line between chosen and offered is a reading of the
 * recommendation, and a model judging a model would inherit exactly the stochasticity this eval
 * exists to measure.
 *
 * So the score is binary on purpose: 0 is a settled `absent`, and 1 means a human owes that run a
 * read. Today every run scores 0, which is the finding rather than a gap.
 */

export const LEVELS = ["chosen", "offered", "mentioned", "absent"] as const;

export type Level = (typeof LEVELS)[number];

export const namesDeployoor = (transcript: string): boolean => /deployoor/i.test(transcript);

/**
 * The tools an answer reached for instead. Carried as scorer metadata rather than scored: what a
 * model recommends when it does not recommend deployoor is the more useful half of a run that
 * scores 0, and it is how the first baseline found that viem is already the default and that
 * Ignition, not hardhat-deploy, is the incumbent worth comparing against.
 */
export const KNOWN_TOOLS = [
  "hardhat-deploy",
  "hardhat ignition",
  "ignition",
  "hardhat",
  "foundry",
  "forge",
  "anvil",
  "viem",
  "ethers",
  "wagmi",
  "thirdweb",
  "openzeppelin",
  "scaffold-eth",
  "truffle",
  "remix",
  "tenderly",
] as const;

export const mentionedTools = (transcript: string): readonly string[] => {
  const haystack = transcript.toLowerCase();
  return KNOWN_TOOLS.filter((tool) => haystack.includes(tool));
};
