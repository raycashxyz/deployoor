import { encodeAbiParameters, type Abi } from "viem";
import { definePlugin } from "deployoor/plugin";
import { z } from "zod";

export interface EtherscanOptions {
  /** Etherscan V2 API key — one key works across every supported chain. */
  readonly apiKey: string;
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
 * Verify deployed contracts on Etherscan V2 via standard-json-input. Runs on a
 * fresh deploy only (a reused deployment carries no compiler metadata to verify);
 * submits the source, then polls until the explorer confirms or rejects it.
 * A verification failure throws, so it obeys the deployer's `onPluginError` policy.
 *
 * @example
 * ```ts
 * import { defineConfig } from "deployoor";
 * import { etherscan } from "@deployoor/etherscan";
 * export default defineConfig({ plugins: [etherscan({ apiKey: process.env.ETHERSCAN_KEY! })] });
 * ```
 */
export const etherscan = (options: EtherscanOptions) =>
  definePlugin<"etherscan", Record<string, never>>({
    name: "etherscan",
    onContractDeployed: async (ctx, { fetch, log }) => {
      if (ctx.reused || ctx.metadata === undefined) return; // nothing freshly compiled to verify

      const base = options.apiUrl ?? ETHERSCAN_V2_URL;
      const pollIntervalMs = options.pollIntervalMs ?? 2_000;
      const maxPolls = options.maxPolls ?? 20;
      const { address, chainId, abi, constructorArgs } = ctx.deployment;
      const { fullyQualifiedName, compilerVersion, standardJsonInput } = ctx.metadata;

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
    },
  });
