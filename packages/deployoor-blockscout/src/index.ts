import { encodeAbiParameters, type Abi } from "viem";
import {
  definePlugin,
  type ContractMetadata,
  type DeploymentRecord,
  type PluginDeps,
} from "deployoor/plugin";
import { z } from "zod";

export interface BlockscoutOptions {
  /**
   * The Blockscout instance to verify on, e.g. `https://eth-sepolia.blockscout.com`.
   *
   * Required, and deliberately not defaulted. Blockscout is not one service: it is software many
   * chains and teams run their own instance of, so there is no host that "means Blockscout" the way
   * `api.etherscan.io` means Etherscan. Guessing one from the chain id would need a table that is
   * wrong for every self-hosted instance and stale for every new chain — and a wrong instance answers
   * about a *different chain*, which is worse than asking.
   *
   * The `/api` suffix is added for you; passing a URL that already ends in `/api` also works.
   */
  readonly instanceUrl: string;
  /**
   * An optional API key.
   *
   * Blockscout verification is keyless. A key raises rate limits, so it is worth setting for a run
   * that verifies many contracts, and pointless for one.
   */
  readonly apiKey?: string;
  /** Milliseconds between verification-status polls. Default 2000. */
  readonly pollIntervalMs?: number;
  /** Maximum status polls before giving up. Default 20. */
  readonly maxPolls?: number;
}

// Blockscout's Etherscan-compatible `contract` endpoints answer { status: "0"|"1", message, result }.
const Reply = z.object({
  status: z.string(),
  message: z.string().optional(),
  result: z.string(),
});

// Blockscout wants `vMAJOR.MINOR.PATCH+commit.<hash>`; artifacts may omit the `v`.
const withVPrefix = (version: string): string => (version.startsWith("v") ? version : `v${version}`);

// ABI-encoded constructor args as hex without the `0x` prefix; empty when there is no constructor.
const encodeConstructorArgs = (abi: Abi, args: readonly unknown[]): string => {
  const ctor = abi.find((item) => item.type === "constructor");
  if (ctor === undefined || ctor.type !== "constructor" || ctor.inputs.length === 0 || args.length === 0) {
    return "";
  }
  return encodeAbiParameters(ctor.inputs, args).slice(2);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A settled-successful verification reply.
 *
 * Anchored, and the group matters: `/^pass|verified/i` parses as `(^pass)|(verified)` — the second
 * alternative is unanchored — so "Contract source code **not verified**" matches it. That is not a
 * hypothetical. A live Routescan run reported success on a contract its own `getsourcecode` still
 * called unverified, because the poll reply contained the word.
 */
const isSettledOk = (result: string): boolean => /^(pass|verified)/i.test(result);

/**
 * Already verified, in either wording.
 *
 * Blockscout says "Smart-contract already verified." where Etherscan says "Contract source code
 * already verified" — and separately, an instance may have *imported* a verification from another
 * explorer, so this is a normal outcome on a first run rather than a sign of a repeat. Observed live:
 * a contract verified on Etherscan showed up already verified on Blockscout minutes later, with a
 * `verified_at` matching the Etherscan submission.
 */
const isAlreadyVerified = (result: string): boolean => /already verified/i.test(result);

/**
 * The instance has not indexed the contract yet.
 *
 * Deploy-time verification races the indexer: the receipt is in hand but the explorer has not caught
 * up. Etherscan words this "Unable to locate ContractCode"; Blockscout has its own phrasings for the
 * same state, so both are matched.
 */
const isNotIndexedYet = (result: string): boolean =>
  /unable to locate contractcode|not found|pending in queue/i.test(result);

/**
 * `maxPolls`, rejected here rather than allowed to become a silent no-op.
 *
 * It bounds both recursions, so a fractional or non-positive value changes behaviour in ways that look
 * like something else: `0` skips the status poll entirely and reports a timeout on a verification that
 * may well have passed, and `NaN` — which is what `Number(process.env.X)` gives for an unset variable —
 * fails every comparison, so the first attempt is also the last.
 */
const requireMaxPolls = (maxPolls: number): number => {
  if (!Number.isInteger(maxPolls) || maxPolls < 1) {
    throw new Error(
      `@deployoor/blockscout: maxPolls must be a positive integer, got ${String(maxPolls)}. It bounds both the submit retry and the status poll.`,
    );
  }
  return maxPolls;
};

/**
 * The instance's API endpoint.
 *
 * Checked when a verification starts rather than when the plugin is constructed, matching the other
 * verifiers: `deployoor.config.ts` is imported by *every* command, so throwing in the factory would
 * make `deployoor generate` fail over an option it never uses.
 */
const requireApiUrl = (instanceUrl: string | undefined): string => {
  if (instanceUrl === undefined || instanceUrl.trim() === "") {
    throw new Error(
      "@deployoor/blockscout: instanceUrl is required and was empty. Blockscout is self-hosted per chain, so there is no default — pass the instance you use, e.g. blockscout({ instanceUrl: 'https://eth-sepolia.blockscout.com' }).",
    );
  }
  const trimmed = instanceUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

interface VerifyRequest {
  readonly options: BlockscoutOptions;
  readonly deployment: DeploymentRecord;
  readonly metadata: ContractMetadata;
  readonly deps: PluginDeps;
}

/**
 * Submit a standard-json verification and poll it to a conclusion.
 *
 * The single implementation behind both hooks: `onContractDeployed` (at deploy time, with the freshly
 * compiled artifact's metadata) and `onVerify` (after the fact, with the metadata read back from the
 * pinned sources sidecar). Both have exactly the same inputs — a record plus a `ContractMetadata` — so
 * neither hook does anything but supply them.
 *
 * Named parameters rather than positional: `deployment` and `metadata` are adjacent objects, so a
 * positional call could swap them and still typecheck.
 */
const verifyDeployment = async ({
  options,
  deployment,
  metadata,
  deps: { fetch, log },
}: VerifyRequest): Promise<void> => {
  const apiUrl = requireApiUrl(options.instanceUrl);
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxPolls = requireMaxPolls(options.maxPolls ?? 20);
  const { address, abi, constructorArgs } = deployment;
  const { fullyQualifiedName, compilerVersion, standardJsonInput } = metadata;

  const body = new URLSearchParams({
    module: "contract",
    action: "verifysourcecode",
    codeformat: "solidity-standard-json-input",
    contractaddress: address,
    contractname: fullyQualifiedName,
    compilerversion: withVPrefix(compilerVersion),
    sourceCode: JSON.stringify(standardJsonInput),
  });
  // Optional, unlike Etherscan: omitted rather than sent empty, so a keyless run does not look like a
  // run with a blank key.
  if (options.apiKey !== undefined && options.apiKey.trim() !== "") body.set("apikey", options.apiKey);

  const constructorArguments = encodeConstructorArgs(abi, constructorArgs);
  if (constructorArguments.length > 0) body.set("constructorArguments", constructorArguments);

  /** Submit, re-trying only while the instance has yet to index the contract. */
  const submitVerification = async (attempt: number): Promise<string | undefined> => {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const reply = Reply.parse(await res.json());
    if (reply.status === "1") return reply.result;

    if (isAlreadyVerified(reply.result)) {
      log.info(`[blockscout] ${fullyQualifiedName} already verified`);
      return undefined;
    }
    if (isNotIndexedYet(reply.result) && attempt + 1 < maxPolls) {
      log.info(`[blockscout] ${fullyQualifiedName} not indexed yet, retrying`);
      await sleep(pollIntervalMs);
      return submitVerification(attempt + 1);
    }
    throw new Error(`Blockscout verification request failed: ${reply.result}`);
  };

  const guid = await submitVerification(0);
  // `undefined` is the already-verified case, which has nothing left to poll.
  if (guid === undefined) return;

  /**
   * Some instances verify synchronously and answer with the outcome instead of a guid, so a status
   * poll for it would ask about a job that never existed. Treating that first reply as the conclusion
   * avoids inventing a timeout for a verification that already passed.
   */
  if (isSettledOk(guid)) {
    log.info(`[blockscout] ${fullyQualifiedName} verified`);
    return;
  }

  // Blockscout returns "Pending in queue" (with status "0") until it settles, so branch on the result
  // text, not the status code.
  const poll = async (attempt: number): Promise<void> => {
    if (attempt >= maxPolls) {
      throw new Error(`Blockscout verification timed out for ${fullyQualifiedName} (guid ${guid})`);
    }
    const query = new URLSearchParams({ module: "contract", action: "checkverifystatus", guid });
    if (options.apiKey !== undefined && options.apiKey.trim() !== "") query.set("apikey", options.apiKey);

    const statusRes = await fetch(`${apiUrl}?${query}`);
    const { result } = Reply.parse(await statusRes.json());
    if (isSettledOk(result) || isAlreadyVerified(result)) {
      log.info(`[blockscout] ${fullyQualifiedName} verified`);
      return;
    }
    if (/^fail/i.test(result)) {
      throw new Error(`Blockscout verification failed for ${fullyQualifiedName}: ${result}`);
    }
    await sleep(pollIntervalMs);
    return poll(attempt + 1);
  };

  return poll(0);
};

/**
 * Verify on a Blockscout instance.
 *
 * `onContractDeployed` runs at deploy time. `onVerify` is what `deployoor verify` calls, which needs
 * no artifacts — it reads the standard-json input the deploy pinned, so a contract stays verifiable
 * long after its source tree moved on.
 *
 * ```ts
 * import { blockscout } from "@deployoor/blockscout";
 *
 * export default defineConfig({
 *   plugins: [blockscout({ instanceUrl: "https://eth-sepolia.blockscout.com" })],
 * });
 * ```
 */
export const blockscout = (options: BlockscoutOptions) =>
  definePlugin({
    name: "blockscout",
    onContractDeployed: async (ctx, deps) => {
      const { deployment, metadata } = ctx;
      if (metadata === undefined) {
        deps.log.info(`[blockscout] no artifact metadata for ${deployment.deploymentName}, skipping`);
        return;
      }
      await verifyDeployment({ options, deployment, metadata, deps });
    },
    onVerify: (ctx, deps) =>
      verifyDeployment({ options, deployment: ctx.deployment, metadata: ctx.metadata, deps }),
  });
