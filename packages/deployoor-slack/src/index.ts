import { definePlugin, type DeploymentRecord } from "deployoor/plugin";

export interface SlackOptions {
  /** Slack Incoming Webhook URL. */
  readonly webhook: string;
  /** Bot username shown in Slack (optional). */
  readonly username?: string;
  /** Build the message text from the deployment record. Defaults to a one-line summary. */
  readonly format?: (deployment: DeploymentRecord) => string;
}

/** Per-deploy overrides — pass `{ slack: { text } }`, or `{ slack: false }` to skip a contract. */
export interface SlackDeployOptions {
  /** A one-off message for this deploy, overriding `format`. */
  readonly text?: string;
}

const defaultFormat = (d: DeploymentRecord): string =>
  `*${d.contractName}* deployed to \`${d.address}\` on ${d.networkName} (chain ${d.chainId})\ntx: \`${d.transactionHash}\``;

/**
 * Notify a Slack channel when a contract is deployed. A deployoor plugin is just a
 * deploy-lifecycle hook — the same shape a verifier uses. Reused deployments (no
 * transaction) are skipped; a non-2xx webhook response throws so the deployer's
 * `onPluginError` policy applies (warn by default, or fail the run with "throw").
 *
 * @example
 * ```ts
 * import { defineConfig } from "deployoor";
 * import { slack } from "@deployoor/slack";
 * export default defineConfig({ plugins: [slack({ webhook: process.env.SLACK_WEBHOOK! })] });
 * ```
 */
export const slack = (options: SlackOptions) =>
  definePlugin<"slack", SlackDeployOptions>({
    name: "slack",
    onContractDeployed: async (ctx, { fetch }) => {
      if (ctx.reused) return; // no transaction happened — nothing to announce
      const text = ctx.options.text ?? (options.format ?? defaultFormat)(ctx.deployment);
      const response = await fetch(options.webhook, {
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
