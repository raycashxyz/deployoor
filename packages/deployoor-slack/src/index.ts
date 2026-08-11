import { definePlugin, type DeploymentRecord } from "deployoor/plugin";

export interface SlackOptions {
  /**
   * Slack Incoming Webhook URL.
   *
   * Typed to admit `undefined` so `process.env.SLACK_WEBHOOK` reads straight through without a
   * non-null assertion. It stays required, and a missing value is rejected when the plugin is
   * constructed rather than becoming a `fetch(undefined)` in the middle of a deploy.
   */
  readonly webhook: string | undefined;
  /** Bot username shown in Slack (optional). */
  readonly username?: string;
  /** Build the message text from the deployment record. Defaults to a one-line summary. */
  readonly format?: (deployment: DeploymentRecord) => string;
  /** Build the message text for failed deploys. Defaults to a one-line failure summary. */
  readonly formatFailed?: (failure: {
    readonly contractName: string;
    readonly deploymentName: string;
    readonly networkName: string;
    readonly chainId: number;
    readonly cause: unknown;
  }) => string;
}

/** Per-deploy overrides — pass `{ slack: { text } }`, or `{ slack: false }` to skip a contract. */
export interface SlackDeployOptions {
  /** A one-off message for this deploy, overriding `format`. */
  readonly text?: string;
}

const defaultFormat = (d: DeploymentRecord): string =>
  `*${d.contractName}* deployed to \`${d.address}\` on ${d.networkName} (chain ${d.chainId})\ntx: \`${d.transactionHash}\``;

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * Notify a Slack channel when a contract is deployed. A deployoor plugin is just a
 * deploy-lifecycle hook — the same shape a verifier uses. Reused deployments (no
 * transaction) are skipped; a non-2xx webhook response throws so the deployer's
 * `onPluginError` policy applies (warn by default, or fail the run with "throw").
 *
 * A missing `webhook` is rejected here, at construction, so an unset environment variable fails
 * while you can still see which variable it was.
 *
 * @example
 * ```ts
 * import { defineConfig } from "deployoor";
 * import { slack } from "@deployoor/slack";
 * export default defineConfig({ plugins: [slack({ webhook: process.env.SLACK_WEBHOOK })] });
 * ```
 */
export const slack = (options: SlackOptions) => {
  const webhook = options.webhook;
  if (webhook === undefined || webhook.trim() === "") {
    throw new Error(
      "@deployoor/slack: webhook is required and was empty. Set your Slack Incoming Webhook URL in the environment (e.g. SLACK_WEBHOOK) and pass it as `slack({ webhook: process.env.SLACK_WEBHOOK })`.",
    );
  }
  return definePlugin<"slack", SlackDeployOptions>({
    name: "slack",
    onContractDeployed: async (ctx, { fetch }) => {
      if (ctx.reused) return; // no transaction happened — nothing to announce
      const text = ctx.options.text ?? (options.format ?? defaultFormat)(ctx.deployment);
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          options.username === undefined ? { text } : { text, username: options.username },
        ),
      });
      if (!response.ok) {
        throw new Error(`Slack webhook responded ${response.status} ${response.statusText}`);
      }
    },
    onDeployFailed: async (ctx, { fetch }) => {
      const text =
        options.formatFailed?.(ctx) ??
        `*${ctx.contractName}* failed to deploy on ${ctx.networkName} (chain ${ctx.chainId})\n${describe(ctx.cause)}`;
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          options.username === undefined ? { text } : { text, username: options.username },
        ),
      });
      if (!response.ok) {
        throw new Error(`Slack webhook responded ${response.status} ${response.statusText}`);
      }
    },
  });
};
