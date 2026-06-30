import { definePlugin } from "deployoor/plugin";
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
 * Verify deployed contracts on Sourcify v2 via standard-json-input. Sourcify is
 * keyless and the same host serves every supported chain. Runs on a fresh deploy
 * (a reused deployment carries no compiler metadata); submission is async, so it
 * polls the verification job until it settles. A failure throws, so it obeys the
 * deployer's `onPluginError` policy.
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
    onContractDeployed: async (ctx, { fetch, log }) => {
      if (ctx.reused || ctx.metadata === undefined) return; // nothing freshly compiled to verify

      const base = options.serverUrl ?? SOURCIFY_SERVER;
      const pollIntervalMs = options.pollIntervalMs ?? 2_000;
      const maxPolls = options.maxPolls ?? 20;
      const { address, chainId, transactionHash } = ctx.deployment;
      const { fullyQualifiedName, compilerVersion, standardJsonInput } = ctx.metadata;

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
    },
  });
