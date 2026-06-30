import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, type Abi } from "viem";
import type { ContractMetadata, DeployedContext, DeploymentRecord, PluginDeps } from "deployoor/plugin";
import { etherscan } from "../src/index";

const abi = [
  {
    type: "constructor",
    inputs: [
      { name: "supply", type: "uint256" },
      { name: "owner", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

const args = [1_000_000n, "0x000000000000000000000000000000000000dEaD"] as const;

const deployment: DeploymentRecord = {
  contractName: "Token",
  deploymentName: "Token",
  address: "0x00000000000000000000000000000000000000c0",
  chainId: 8453,
  networkName: "base",
  abi,
  bytecode: "0x60",
  constructorArgs: args,
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
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  libraryPlaceholders: {},
};

const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

const makeDeps = () => {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
    reply({ status: "0", result: "no queued response" }),
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
  plugin: ReturnType<typeof etherscan>,
  ctx: DeployedContext<Record<string, never>>,
  deps: PluginDeps,
) => {
  const hook = plugin.onContractDeployed;
  if (hook === undefined) throw new Error("etherscan plugin must define onContractDeployed");
  return hook(ctx, deps);
};

const formOf = (fetch: ReturnType<typeof makeDeps>["fetch"], index: number) => {
  const call = fetch.mock.calls.at(index);
  if (call === undefined) throw new Error(`no fetch call at index ${index}`);
  const init = call[1];
  if (init === undefined || !(init.body instanceof URLSearchParams)) throw new Error("expected a form body");
  return { url: String(call[0]), method: init.method, params: init.body };
};

const queryOf = (fetch: ReturnType<typeof makeDeps>["fetch"], index: number): URLSearchParams => {
  const call = fetch.mock.calls.at(index);
  if (call === undefined) throw new Error(`no fetch call at index ${index}`);
  return new URL(String(call[0])).searchParams;
};

const requireParam = (params: URLSearchParams, key: string): string => {
  const value = params.get(key);
  if (value === null) throw new Error(`missing form field ${key}`);
  return value;
};

const plugin = (over: Partial<Parameters<typeof etherscan>[0]> = {}) =>
  etherscan({ apiKey: "KEY", apiUrl: "https://api.test/v2", pollIntervalMs: 0, ...over });

describe("etherscan plugin", () => {
  it("submits a standard-json verification request with the expected fields", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    const { url, method, params } = formOf(fetch, 0);
    expect(url).toBe("https://api.test/v2");
    expect(method).toBe("POST");
    expect(params.get("module")).toBe("contract");
    expect(params.get("action")).toBe("verifysourcecode");
    expect(params.get("codeformat")).toBe("solidity-standard-json-input");
    expect(params.get("chainid")).toBe("8453");
    expect(params.get("contractaddress")).toBe(deployment.address);
    expect(params.get("contractname")).toBe("contracts/Token.sol:Token");
    expect(params.get("compilerversion")).toBe("v0.8.24+commit.e11b9ed9"); // v-prefixed
    expect(JSON.parse(requireParam(params, "sourceCode")).language).toBe("Solidity");
  });

  it("polls checkverifystatus until the contract is verified", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "0", message: "NOTOK", result: "Pending in queue" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    expect(fetch).toHaveBeenCalledTimes(3);
    // the poll is a GET — its action rides in the URL query, not a form body
    expect(queryOf(fetch, 2).get("action")).toBe("checkverifystatus");
  });

  it("treats an already-verified contract as success without polling", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(
      reply({ status: "0", message: "NOTOK", result: "Contract source code already verified" }),
    );

    await expect(run(plugin(), makeCtx(), deps)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1); // no status poll
  });

  it("throws when the explorer reports a verification failure", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "0", result: "Fail - Unable to verify" }));

    await expect(run(plugin(), makeCtx(), deps)).rejects.toThrow(/verification failed/i);
  });

  it("skips verification when the deployment was reused (no metadata)", async () => {
    const { deps, fetch } = makeDeps();
    await run(plugin(), makeCtx({ reused: true, metadata: undefined }), deps);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ABI-encodes constructor arguments into the request", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    const expected = encodeAbiParameters(abi[0].inputs, args).slice(2);
    expect(formOf(fetch, 0).params.get("constructorArguments")).toBe(expected);
    expect(expected.length).toBeGreaterThan(0);
  });
});
