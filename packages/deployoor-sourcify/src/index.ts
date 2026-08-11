import {
  definePlugin,
  type ContractMetadata,
  type DeploymentRecord,
  type PluginDeps,
} from "deployoor/plugin";
import { z } from "zod";

export interface SourcifyOptions {
  /** Sourcify verification server. Default `https://sourcify.dev/server`. */
  readonly serverUrl?: string;
  /** Milliseconds between job-status polls. Default 2000. */
  readonly pollIntervalMs?: number;
  /** Maximum status polls before giving up. Default 20. */
  readonly maxPolls?: number;
}

const SOURCIFY_SERVER = "https://sourcify.dev/server";

// POST /v2/verify/{chainId}/{address} → 202 { verificationId }.
const SubmitReply = z.object({ verificationId: z.string() });
// GET /v2/verify/{verificationId} → job status (200 even on failure).
const JobReply = z.object({
  isJobCompleted: z.boolean(),
  contract: z.object({ match: z.string().nullish() }).optional(),
  error: z.object({ message: z.string(), customCode: z.string().optional() }).optional(),
});
const ErrorReply = z.object({ message: z.string(), customCode: z.string().optional() });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/**
 * Submit a standard-json verification job and poll it to a conclusion.
 *
 * The single implementation behind both hooks: `onContractDeployed` (at deploy time, with the
 * freshly compiled artifact's metadata) and `onVerify` (after the fact, with the metadata read back
 * from the pinned sources sidecar). Both have exactly the same inputs — a record plus a
 * `ContractMetadata` — so neither hook does anything but supply them.
 */
const verifyDeployment = async (
  options: SourcifyOptions,
  deployment: DeploymentRecord,
  metadata: ContractMetadata,
  { fetch, log }: PluginDeps,
): Promise<void> => {
  const base = options.serverUrl ?? SOURCIFY_SERVER;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const maxPolls = options.maxPolls ?? 20;
  const { address, chainId, transactionHash } = deployment;
  const { fullyQualifiedName, compilerVersion, standardJsonInput } = metadata;

  const submitRes = await fetch(`${base}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: standardJsonInput,
      compilerVersion,
      contractIdentifier: fullyQualifiedName,
      creationTransactionHash: transactionHash,
    }),
  });
  if (submitRes.status === 409) {
    log.info(`[sourcify] ${fullyQualifiedName} already verified`);
    return;
  }
  if (!submitRes.ok) {
    const parsed = ErrorReply.safeParse(await readJson(submitRes));
    const detail = parsed.success ? parsed.data.message : `HTTP ${submitRes.status}`;
    throw new Error(`Sourcify verification request failed: ${detail}`);
  }
  const { verificationId } = SubmitReply.parse(await submitRes.json());

  const poll = async (attempt: number): Promise<void> => {
    if (attempt >= maxPolls) {
      throw new Error(`Sourcify verification timed out for ${fullyQualifiedName}`);
    }
    const jobRes = await fetch(`${base}/v2/verify/${verificationId}`);
    const job = JobReply.parse(await jobRes.json());
    if (!job.isJobCompleted) {
      await sleep(pollIntervalMs);
      return poll(attempt + 1);
    }
    if (job.error !== undefined) {
      // Sourcify v2 reports an already-verified contract as a COMPLETED job carrying
      // this error code — the submit returns 202 (not 409), so the guard above never
      // catches it. Treat it as success, mirroring the etherscan plugin.
      if (job.error.customCode === "already_verified") {
        log.info(`[sourcify] ${fullyQualifiedName} already verified`);
        return;
      }
      throw new Error(`Sourcify verification failed for ${fullyQualifiedName}: ${job.error.message}`);
    }
    if (
      job.contract !== undefined &&
      (job.contract.match === "match" || job.contract.match === "exact_match")
    ) {
      log.info(`[sourcify] ${fullyQualifiedName} verified (${job.contract.match})`);
      return;
    }
    throw new Error(`Sourcify verification finished without a match for ${fullyQualifiedName}`);
  };
  await poll(0);
};

/**
 * Verify deployed contracts on Sourcify v2 via standard-json-input. Sourcify is keyless and the
 * same host serves every supported chain.
 *
 * `onContractDeployed` runs at deploy time. When a reused deployment still has artifact metadata it
 * can retry verification without forcing a redeploy; otherwise it skips. `onVerify` is what
 * `deployoor verify` calls to verify a recorded deployment after the fact, from the sources pinned
 * beside it — no recompile. Both share one implementation.
 *
 * @example
 * ```ts
 * import { defineConfig } from "deployoor";
 * import { sourcify } from "@deployoor/sourcify";
 * export default defineConfig({ plugins: [sourcify()] });
 * ```
 */
export const sourcify = (options: SourcifyOptions = {}) =>
  definePlugin<"sourcify", Record<string, never>>({
    name: "sourcify",
    onContractDeployed: async (ctx, deps) => {
      if (ctx.metadata === undefined) return; // no compiler input available to verify
      await verifyDeployment(options, ctx.deployment, ctx.metadata, deps);
    },
    // `VerifyContext.metadata` is required — a record with no pinned sources never gets here.
    onVerify: (ctx, deps) => verifyDeployment(options, ctx.deployment, ctx.metadata, deps),
  });
