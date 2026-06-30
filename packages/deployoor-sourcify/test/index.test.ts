import { describe, it, expect, vi } from "vitest";
import type { ContractMetadata, DeployedContext, DeploymentRecord, PluginDeps } from "deployoor/plugin";
import { sourcify, type SourcifyOptions } from "../src/index";

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

const metadata: ContractMetadata = {
  fullyQualifiedName: "contracts/Token.sol:Token",
  compilerVersion: "0.8.24+commit.e11b9ed9",
  standardJsonInput: {
    language: "Solidity",
    sources: { "contracts/Token.sol": { content: "// SPDX\ncontract Token {}" } },
    settings: {},
  },
  libraryPlaceholders: {},
};

const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

const makeDeps = () => {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
    reply({}, 500),
  );
  const deps: PluginDeps = { fetch, now: () => 0, log: { info: vi.fn(), warn: vi.fn() } };
  return { deps, fetch };
};

const makeCtx = (
  over: Partial<DeployedContext<Record<string, never>>> = {},
): DeployedContext<Record<string, never>> => ({
  deployment,
  reused: false,
  options: {},
  metadata,
  ...over,
});

const run = (
  plugin: ReturnType<typeof sourcify>,
  ctx: DeployedContext<Record<string, never>>,
  deps: PluginDeps,
) => {
  const hook = plugin.onContractDeployed;
  if (hook === undefined) throw new Error("sourcify plugin must define onContractDeployed");
  return hook(ctx, deps);
};

const callOf = (fetch: ReturnType<typeof makeDeps>["fetch"], index: number) => {
  const call = fetch.mock.calls.at(index);
  if (call === undefined) throw new Error(`no fetch call at index ${index}`);
  const init = call[1];
  // JSON.parse yields `any`; fine for reading assertions in a test.
  const body = init !== undefined && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  return { url: String(call[0]), method: init?.method, body };
};

const plugin = (over: Partial<SourcifyOptions> = {}) =>
  sourcify({ serverUrl: "https://srv.test/server", pollIntervalMs: 0, ...over });

describe("sourcify plugin", () => {
  it("submits a v2 std-json verification to /v2/verify/{chainId}/{address}", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ verificationId: "v1" }, 202));
    fetch.mockResolvedValueOnce(reply({ isJobCompleted: true, contract: { match: "match" } }));

    await run(plugin(), makeCtx(), deps);

    const { url, method, body } = callOf(fetch, 0);
    expect(url).toBe("https://srv.test/server/v2/verify/8453/0x00000000000000000000000000000000000000c0");
    expect(method).toBe("POST");
    expect(body.contractIdentifier).toBe("contracts/Token.sol:Token");
    expect(body.compilerVersion).toBe("0.8.24+commit.e11b9ed9");
    expect(body.stdJsonInput.language).toBe("Solidity");
    expect(body.creationTransactionHash).toBe(deployment.transactionHash);
  });

  it("polls the verification job until it completes and confirms a match", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ verificationId: "v1" }, 202));
    fetch.mockResolvedValueOnce(reply({ isJobCompleted: false }));
    fetch.mockResolvedValueOnce(reply({ isJobCompleted: true, contract: { match: "exact_match" } }));

    await run(plugin(), makeCtx(), deps);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(callOf(fetch, 2).url).toBe("https://srv.test/server/v2/verify/v1");
  });

  it("treats HTTP 409 as already verified without polling", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ customCode: "already_verified" }, 409));

    await expect(run(plugin(), makeCtx(), deps)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when the job completes with an error", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ verificationId: "v1" }, 202));
    fetch.mockResolvedValueOnce(
      reply({ isJobCompleted: true, error: { message: "bytecode mismatch", customCode: "no_match" } }),
    );

    await expect(run(plugin(), makeCtx(), deps)).rejects.toThrow(/verification failed/i);
  });

  it("throws when the submission is rejected (e.g. unsupported chain)", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(
      reply({ message: "chain 9 not supported", customCode: "unsupported_chain" }, 400),
    );

    await expect(run(plugin(), makeCtx(), deps)).rejects.toThrow(/not supported/i);
  });

  it("skips verification when the deployment was reused (no metadata)", async () => {
    const { deps, fetch } = makeDeps();
    await run(plugin(), makeCtx({ reused: true, metadata: undefined }), deps);
    expect(fetch).not.toHaveBeenCalled();
  });
});
