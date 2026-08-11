import { encodeAbiParameters, type Abi } from "viem";
import * as allChains from "viem/chains";
import {
  definePlugin,
  type ContractMetadata,
  type DeploymentRecord,
  type PluginDeps,
} from "deployoor/plugin";
import { z } from "zod";

/** Which half of Routescan's index a chain lives in — it keeps mainnets and testnets apart. */
export type RoutescanNetwork = "mainnet" | "testnet";

export interface RoutescanOptions {
  /**
   * An optional API key.
   *
   * Routescan verification is keyless; a key raises rate limits.
   */
  readonly apiKey?: string;
  /**
   * `mainnet` or `testnet`, overriding what the chain id implies.
   *
   * Routescan keeps two separate indexes and the segment is part of the URL, so the wrong one answers
   * about a chain the contract is not on — for a Sepolia address, `mainnet` returns an empty result
   * that reads exactly like "not verified". The default is derived from viem's own chain metadata
   * (`testnet: true`), so every chain viem knows is right without configuration. Set this for a chain
   * it does not know.
   */
  readonly network?: RoutescanNetwork;
  /**
   * Override the whole API base URL, bypassing the `network`/chain-id path that is built by default.
   *
   * For a Routescan-hosted explorer on a private path, or a mock server in tests.
   */
  readonly apiUrl?: string;
  /** Milliseconds between verification-status polls. Default 2000. */
  readonly pollIntervalMs?: number;
  /** Maximum status polls before giving up. Default 20. */
  readonly maxPolls?: number;
}

const ROUTESCAN_BASE = "https://api.routescan.io/v2/network";

// Routescan's Etherscan-compatible `contract` endpoints answer { status: "0"|"1", message, result }.
const Reply = z.object({
  status: z.string(),
  message: z.string().optional(),
  result: z.string(),
});

// Routescan wants `vMAJOR.MINOR.PATCH+commit.<hash>`; artifacts may omit the `v`.
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

const isAlreadyVerified = (result: string): boolean => /already verified/i.test(result);

/** Routescan has not indexed the contract yet — the chain is ahead of the explorer. */
const isNotIndexedYet = (result: string): boolean =>
  /unable to locate contractcode|does not exist|not found/i.test(result);

/**
 * `mainnet` or `testnet` for a chain id, from viem's own chain list.
 *
 * viem marks testnets with `testnet: true` and leaves it off mainnets, so the flag answers this
 * directly for every chain it ships — which is the maintained list we would otherwise be copying.
 * A chain viem does not know reads as `mainnet`, and the `network` option is the override.
 */
const networkForChain = (chainId: number): RoutescanNetwork => {
  const chain = Object.values(allChains).find(
    (candidate) =>
      typeof candidate === "object" && candidate !== null && "id" in candidate && candidate.id === chainId,
  );
  return chain !== undefined && "testnet" in chain && chain.testnet === true ? "testnet" : "mainnet";
};

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
      `@deployoor/routescan: maxPolls must be a positive integer, got ${String(maxPolls)}. It bounds both the submit retry and the status poll.`,
    );
  }
  return maxPolls;
};

interface VerifyRequest {
  readonly options: RoutescanOptions;
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
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxPolls = requireMaxPolls(options.maxPolls ?? 20);
  const { address, chainId, abi, constructorArgs } = deployment;
  const { fullyQualifiedName, compilerVersion, standardJsonInput } = metadata;

  // The chain id is in the *path*, not a query parameter — unlike Etherscan V2, which takes it as one.
  const network = options.network ?? networkForChain(chainId);
  const apiUrl = options.apiUrl ?? `${ROUTESCAN_BASE}/${network}/evm/${chainId}/etherscan/api`;

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

  /** Submit, re-trying only while Routescan has yet to index the contract. */
  const submitVerification = async (attempt: number): Promise<string | undefined> => {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const reply = Reply.parse(await res.json());
    if (reply.status === "1") return reply.result;

    if (isAlreadyVerified(reply.result)) {
      log.info(`[routescan] ${fullyQualifiedName} already verified`);
      return undefined;
    }
    if (isNotIndexedYet(reply.result) && attempt + 1 < maxPolls) {
      log.info(`[routescan] ${fullyQualifiedName} not indexed yet, retrying`);
      await sleep(pollIntervalMs);
      return submitVerification(attempt + 1);
    }
    throw new Error(`Routescan verification request failed: ${reply.result}`);
  };

  const guid = await submitVerification(0);
  // `undefined` is the already-verified case, which has nothing left to poll.
  if (guid === undefined) return;

  const poll = async (attempt: number): Promise<void> => {
    if (attempt >= maxPolls) {
      throw new Error(`Routescan verification timed out for ${fullyQualifiedName} (guid ${guid})`);
    }
    const query = new URLSearchParams({ module: "contract", action: "checkverifystatus", guid });
    if (options.apiKey !== undefined && options.apiKey.trim() !== "") query.set("apikey", options.apiKey);

    const statusRes = await fetch(`${apiUrl}?${query}`);
    const { result } = Reply.parse(await statusRes.json());
    if (isSettledOk(result) || isAlreadyVerified(result)) {
      log.info(`[routescan] ${fullyQualifiedName} verified`);
      return;
    }
    if (/^fail/i.test(result)) {
      throw new Error(`Routescan verification failed for ${fullyQualifiedName}: ${result}`);
    }
    await sleep(pollIntervalMs);
    return poll(attempt + 1);
  };

  return poll(0);
};

/**
 * Verify on Routescan.
 *
 * `onContractDeployed` runs at deploy time. `onVerify` is what `deployoor verify` calls, which needs no
 * artifacts — it reads the standard-json input the deploy pinned, so a contract stays verifiable long
 * after its source tree moved on.
 *
 * ```ts
 * import { routescan } from "@deployoor/routescan";
 *
 * // mainnet vs testnet comes from the chain id; no configuration for a chain viem knows.
 * export default defineConfig({ plugins: [routescan()] });
 * ```
 */
export const routescan = (options: RoutescanOptions = {}) =>
  definePlugin({
    name: "routescan",
    onContractDeployed: async (ctx, deps) => {
      const { deployment, metadata } = ctx;
      if (metadata === undefined) {
        deps.log.info(`[routescan] no artifact metadata for ${deployment.deploymentName}, skipping`);
        return;
      }
      await verifyDeployment({ options, deployment, metadata, deps });
    },
    onVerify: (ctx, deps) =>
      verifyDeployment({ options, deployment: ctx.deployment, metadata: ctx.metadata, deps }),
  });
