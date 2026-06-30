import { describe, it, expect, vi } from "vitest";
import type { DeployedContext, DeploymentRecord, PluginDeps } from "deployoor/plugin";
import { slack, type SlackDeployOptions } from "../src/index";

const deployment: DeploymentRecord = {
  contractName: "Token",
  deploymentName: "Token",
  address: "0x00000000000000000000000000000000000000c0",
  chainId: 8453,
  networkName: "base",
  abi: [],
  bytecode: "0x60",
  constructorArgs: [],
  transactionHash: "0xabababababababababababababababababababababababababababababababab",
  deployer: "0x000000000000000000000000000000000000dead",
  deployedAt: 0,
  compiler: { version: "0.8.24+commit.e11b9ed9" },
  kind: "standard",
};

const makeDeps = (response: Response) => {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response);
  const deps: PluginDeps = { fetch, now: () => 0, log: { info: vi.fn(), warn: vi.fn() } };
  return { deps, fetch };
};

const makeCtx = (
  over: Partial<DeployedContext<SlackDeployOptions>> = {},
): DeployedContext<SlackDeployOptions> => ({ deployment, reused: false, options: {}, ...over });

const run = (
  plugin: ReturnType<typeof slack>,
  ctx: DeployedContext<SlackDeployOptions>,
  deps: PluginDeps,
) => {
  const hook = plugin.onContractDeployed;
  if (hook === undefined) throw new Error("slack plugin must define onContractDeployed");
  return hook(ctx, deps);
};

const postedBody = (fetch: ReturnType<typeof makeDeps>["fetch"]): Record<string, unknown> => {
  const call = fetch.mock.calls.at(0);
  if (call === undefined) throw new Error("fetch was not called");
  const init = call[1];
  if (init === undefined || typeof init.body !== "string") throw new Error("expected a JSON string body");
  return JSON.parse(init.body) as Record<string, unknown>;
};

describe("slack plugin", () => {
  it("posts a message to the webhook on a fresh deploy", async () => {
    const { deps, fetch } = makeDeps(new Response("ok", { status: 200 }));
    await run(slack({ webhook: "https://hooks.slack.test/abc" }), makeCtx(), deps);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.test/abc",
      expect.objectContaining({ method: "POST" }),
    );
    const body = postedBody(fetch);
    expect(body.text).toContain("Token");
    expect(body.text).toContain("base");
  });

  it("skips the webhook when the deployment was reused", async () => {
    const { deps, fetch } = makeDeps(new Response("ok", { status: 200 }));
    await run(slack({ webhook: "https://hooks.slack.test/abc" }), makeCtx({ reused: true }), deps);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when the webhook responds non-2xx so the deployer's policy applies", async () => {
    const { deps } = makeDeps(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }));
    await expect(run(slack({ webhook: "https://hooks.slack.test/abc" }), makeCtx(), deps)).rejects.toThrow(
      /429/,
    );
  });

  it("prefers a per-deploy text override over the default message", async () => {
    const { deps, fetch } = makeDeps(new Response("ok", { status: 200 }));
    await run(
      slack({ webhook: "https://hooks.slack.test/abc" }),
      makeCtx({ options: { text: "ship it 🚀" } }),
      deps,
    );
    expect(postedBody(fetch).text).toBe("ship it 🚀");
  });

  it("uses a custom format function when provided", async () => {
    const { deps, fetch } = makeDeps(new Response("ok", { status: 200 }));
    const plugin = slack({
      webhook: "https://hooks.slack.test/abc",
      format: (d) => `deployed ${d.contractName}`,
    });
    await run(plugin, makeCtx(), deps);
    expect(postedBody(fetch).text).toBe("deployed Token");
  });

  it("includes the bot username when configured", async () => {
    const { deps, fetch } = makeDeps(new Response("ok", { status: 200 }));
    await run(slack({ webhook: "https://hooks.slack.test/abc", username: "deployoor-bot" }), makeCtx(), deps);
    expect(postedBody(fetch).username).toBe("deployoor-bot");
  });
});
