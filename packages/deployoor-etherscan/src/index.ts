import { encodeAbiParameters, type Abi } from "viem";
import {
  definePlugin,
  type ContractMetadata,
  type DeploymentRecord,
  type PluginDeps,
} from "deployoor/plugin";
import { z } from "zod";

export interface EtherscanOptions {
  /**
   * Etherscan V2 API key — one key works across every supported chain.
   *
   * Typed to admit `undefined` so `process.env.ETHERSCAN_KEY` reads straight through without a
   * non-null assertion. The key stays required, and a missing value is rejected when a verification
   * starts rather than becoming `apikey: undefined` in a request and coming back as an opaque
   * authentication failure from the explorer.
   */
  readonly apiKey: string | undefined;
  /**
   * Override the API base URL. Defaults to Etherscan V2
   * (`https://api.etherscan.io/v2/api`). Point it at any Etherscan-compatible
   * endpoint — a Blockscout/Routescan instance, or a mock server in tests.
   */
  readonly apiUrl?: string;
  /** Milliseconds between verification-status polls. Default 2000. */
  readonly pollIntervalMs?: number;
  /** Maximum status polls before giving up. Default 20. */
  readonly maxPolls?: number;
}

const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

// Etherscan's `contract` endpoints answer with { status: "0"|"1", message, result }.
const Reply = z.object({
  status: z.string(),
  message: z.string().optional(),
  result: z.string(),
});

// Etherscan wants `vMAJOR.MINOR.PATCH+commit.<hash>`; artifacts may omit the `v`.
const withVPrefix = (version: string): string => (version.startsWith("v") ? version : `v${version}`);

// ABI-encoded constructor args as hex without the `0x` prefix (Etherscan's format);
// empty string when the contract has no constructor or took no args.
const encodeConstructorArgs = (abi: Abi, args: readonly unknown[]): string => {
  const ctor = abi.find((item) => item.type === "constructor");
  // the type re-check narrows ctor to the constructor variant (so .inputs is typed)
  if (ctor === undefined || ctor.type !== "constructor" || ctor.inputs.length === 0 || args.length === 0) {
    return "";
  }
  return encodeAbiParameters(ctor.inputs, args).slice(2);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isAlreadyVerified = (result: string): boolean => /already verified/i.test(result);

/**
 * Etherscan has not indexed the contract yet.
 *
 * Deploy-time verification loses this race routinely — the receipt is in hand, but Etherscan's own
 * indexer has not caught up, so it answers "Unable to locate ContractCode at 0x…". Observed on a real
 * Sepolia deploy: the submit went out immediately after the receipt and failed, while the identical
 * request through `deployoor verify` seconds later succeeded. Waiting and re-submitting is the fix
 * (hardhat-verify does the same), because the request itself is fine — the chain is just ahead of the
 * explorer.
 */
const isNotIndexedYet = (result: string): boolean => /unable to locate contractcode/i.test(result);

/**
 * `maxPolls`, rejected here rather than allowed to become a silent no-op.
 *
 * It bounds both recursions, so a fractional or non-positive value changes behaviour in ways that look
 * like something else: `0` skips the status poll entirely and reports a timeout on a verification that
 * may well have passed, and `NaN` — which is what `Number(process.env.X)` gives for an unset variable —
 * fails every comparison, so the first attempt is also the last. Neither is distinguishable from a bug
 * in the plugin at the point it surfaces, which is why this is a local error naming the option.
 */
const requireMaxPolls = (maxPolls: number): number => {
  if (!Number.isInteger(maxPolls) || maxPolls < 1) {
    throw new Error(
      `@deployoor/etherscan: maxPolls must be a positive integer, got ${String(maxPolls)}. It bounds both the submit retry and the status poll.`,
    );
  }
  return maxPolls;
};

interface VerifyRequest {
  readonly options: EtherscanOptions;
  readonly deployment: DeploymentRecord;
  readonly metadata: ContractMetadata;
  readonly deps: PluginDeps;
}

/**
 * The key, or a local error naming the variable to set.
 *
 * Checked when a verification actually starts, not when the plugin is constructed. `deployoor.config.ts`
 * is imported by *every* command, so throwing in the factory made `deployoor generate` fail over a
 * missing Etherscan key it never uses — which is worse than the problem being fixed, since working
 * without an explorer key is the normal local case.
 *
 * Verification is the only thing that needs the key, and this runs before the first request, so the
 * failure is still local and still says which variable is unset instead of arriving as an
 * authentication error from the explorer.
 */
const requireApiKey = (apiKey: string | undefined): string => {
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(
      "@deployoor/etherscan: apiKey is required and was empty. Etherscan V2 needs one key for every chain — set it in your environment (e.g. ETHERSCAN_KEY) and pass it as `etherscan({ apiKey: process.env.ETHERSCAN_KEY })`.",
    );
  }
  return apiKey;
};

/**
 * Submit a standard-json verification and poll it to a conclusion.
 *
 * The single implementation behind both hooks: `onContractDeployed` (at deploy time, with the
 * freshly compiled artifact's metadata) and `onVerify` (after the fact, with the metadata read back
 * from the pinned sources sidecar). Both have exactly the same inputs — a record plus a
 * `ContractMetadata` — so neither hook does anything but supply them.
 *
 * Named parameters rather than positional: `deployment` and `metadata` are adjacent objects, so a
 * positional call could swap them and still typecheck at neither call site's expense.
 */
const verifyDeployment = async ({
  options,
  deployment,
  metadata,
  deps: { fetch, log },
}: VerifyRequest): Promise<void> => {
  const apiKey = requireApiKey(options.apiKey);
  const base = options.apiUrl ?? ETHERSCAN_V2_URL;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxPolls = requireMaxPolls(options.maxPolls ?? 20);
  const { address, chainId, abi, constructorArgs } = deployment;
  const { fullyQualifiedName, compilerVersion, standardJsonInput } = metadata;

  const body = new URLSearchParams({
    apikey: apiKey,
    chainid: String(chainId),
    module: "contract",
    action: "verifysourcecode",
    codeformat: "solidity-standard-json-input",
    contractaddress: address,
    contractname: fullyQualifiedName,
    compilerversion: withVPrefix(compilerVersion),
    sourceCode: JSON.stringify(standardJsonInput),
  });
  const constructorArguments = encodeConstructorArgs(abi, constructorArgs);
  if (constructorArguments.length > 0) body.set("constructorArguments", constructorArguments);

  // `chainid` has to be on the URL, not only in the form body. V2 rejects a body-only chainid with
  // "Missing or unsupported chainid parameter (required for v2 api)" — which no mock fetch could ever
  // have caught, and which made live verification fail every time. It stays in the body too, since
  // Blockscout/Routescan endpoints reached via `apiUrl` read it from there.
  const submitUrl = `${base}?${new URLSearchParams({ chainid: String(chainId) })}`;

  /** Submit, re-trying only while the explorer has yet to index the contract. */
  const submitVerification = async (attempt: number): Promise<string | undefined> => {
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const reply = Reply.parse(await res.json());
    if (reply.status === "1") return reply.result;

    if (isAlreadyVerified(reply.result)) {
      log.info(`[etherscan] ${fullyQualifiedName} already verified`);
      return undefined;
    }
    if (isNotIndexedYet(reply.result) && attempt + 1 < maxPolls) {
      log.info(`[etherscan] ${fullyQualifiedName} not indexed yet, retrying`);
      await sleep(pollIntervalMs);
      return submitVerification(attempt + 1);
    }
    throw new Error(`Etherscan verification request failed: ${reply.result}`);
  };

  const guid = await submitVerification(0);
  // `undefined` is the already-verified case, which has nothing left to poll.
  if (guid === undefined) return;

  // Etherscan returns "Pending in queue" (with status "0") until it settles, so
  // branch on the result text, not the status code.
  const poll = async (attempt: number): Promise<void> => {
    if (attempt >= maxPolls) {
      throw new Error(`Etherscan verification timed out for ${fullyQualifiedName} (guid ${guid})`);
    }
    const query = new URLSearchParams({
      apikey: apiKey,
      chainid: String(chainId),
      module: "contract",
      action: "checkverifystatus",
      guid,
    });
    const statusRes = await fetch(`${base}?${query}`);
    const { result } = Reply.parse(await statusRes.json());
    if (result === "Pass - Verified" || isAlreadyVerified(result)) {
      log.info(`[etherscan] ${fullyQualifiedName} verified`);
      return;
    }
    if (/^fail/i.test(result)) {
      throw new Error(`Etherscan verification failed for ${fullyQualifiedName}: ${result}`);
    }
    await sleep(pollIntervalMs);
    return poll(attempt + 1);
  };
  await poll(0);
};

/**
 * Verify deployed contracts on Etherscan V2 via standard-json-input.
 *
 * `onContractDeployed` runs at deploy time. When a reused deployment still has artifact metadata it
 * can retry verification without forcing a redeploy; otherwise it skips. `onVerify` is what
 * `deployoor verify` calls to verify a recorded deployment after the fact, from the sources pinned
 * beside it — no recompile. Both share one implementation.
 *
 * A verification failure throws: at deploy time that obeys the deployer's `onPluginError` policy,
 * and under `deployoor verify` it marks that contract failed and exits non-zero.
 *
 * A missing `apiKey` fails when a verification starts, naming the variable to set, rather than
 * arriving as an authentication error from the explorer. Not at construction: `deployoor.config.ts`
 * is imported by every command, so that would fail `deployoor generate` over a key it never uses.
 *
 * @example
 * ```ts
 * import { defineConfig } from "deployoor";
 * import { etherscan } from "@deployoor/etherscan";
 * export default defineConfig({ plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY })] });
 * ```
 */
export const etherscan = (options: EtherscanOptions) =>
  definePlugin<"etherscan", Record<string, never>>({
    name: "etherscan",
    onContractDeployed: async (ctx, deps) => {
      const metadata = ctx.metadata;
      if (metadata === undefined) return; // no compiler input available to verify
      await verifyDeployment({ options, deployment: ctx.deployment, metadata, deps });
    },
    // `VerifyContext.metadata` is required — a record with no pinned sources never gets here.
    onVerify: (ctx, deps) =>
      verifyDeployment({ options, deployment: ctx.deployment, metadata: ctx.metadata, deps }),
  });
