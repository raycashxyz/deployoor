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
   * non-null assertion. The key stays required, and a missing value is rejected when the plugin is
   * constructed rather than becoming `apikey: undefined` in a request and coming back as an opaque
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
 * `EtherscanOptions` once the factory has checked the key.
 *
 * The request builders take this rather than `EtherscanOptions`, so the type — not a convention —
 * is what stops an unchecked `undefined` reaching `apikey`.
 */
interface CheckedOptions extends Omit<EtherscanOptions, "apiKey"> {
  readonly apiKey: string;
}

interface VerifyRequest {
  readonly options: CheckedOptions;
  readonly deployment: DeploymentRecord;
  readonly metadata: ContractMetadata;
  readonly deps: PluginDeps;
}

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
  const base = options.apiUrl ?? ETHERSCAN_V2_URL;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxPolls = options.maxPolls ?? 20;
  const { address, chainId, abi, constructorArgs } = deployment;
  const { fullyQualifiedName, compilerVersion, standardJsonInput } = metadata;

  const body = new URLSearchParams({
    apikey: options.apiKey,
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

  const submitRes = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const submit = Reply.parse(await submitRes.json());
  if (submit.status !== "1") {
    if (isAlreadyVerified(submit.result)) {
      log.info(`[etherscan] ${fullyQualifiedName} already verified`);
      return;
    }
    throw new Error(`Etherscan verification request failed: ${submit.result}`);
  }
  const guid = submit.result;

  // Etherscan returns "Pending in queue" (with status "0") until it settles, so
  // branch on the result text, not the status code.
  const poll = async (attempt: number): Promise<void> => {
    if (attempt >= maxPolls) {
      throw new Error(`Etherscan verification timed out for ${fullyQualifiedName} (guid ${guid})`);
    }
    const query = new URLSearchParams({
      apikey: options.apiKey,
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
 * A missing `apiKey` is rejected here, at construction — so an unset environment variable fails while
 * you can still see which variable it was, instead of at the end of a deploy as an authentication
 * error from the explorer.
 *
 * @example
 * ```ts
 * import { defineConfig } from "deployoor";
 * import { etherscan } from "@deployoor/etherscan";
 * export default defineConfig({ plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY })] });
 * ```
 */
export const etherscan = (rawOptions: EtherscanOptions) => {
  const apiKey = rawOptions.apiKey;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(
      "@deployoor/etherscan: apiKey is required and was empty. Etherscan V2 needs one key for every chain — set it in your environment (e.g. ETHERSCAN_KEY) and pass it as `etherscan({ apiKey: process.env.ETHERSCAN_KEY })`.",
    );
  }
  const options: CheckedOptions = { ...rawOptions, apiKey };
  return definePlugin<"etherscan", Record<string, never>>({
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
};
