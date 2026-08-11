import { describe, it, expect, vi } from "vitest";
import { encodeAbiParameters, type Abi } from "viem";
import type {
  ContractMetadata,
  DeployedContext,
  DeploymentRecord,
  PluginDeps,
  VerifyContext,
} from "deployoor/plugin";
import { routescan, type RoutescanOptions } from "../src/index";

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
  schemaVersion: 1,
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
  plugin: ReturnType<typeof routescan>,
  ctx: DeployedContext<Record<string, never>>,
  deps: PluginDeps,
) => {
  const hook = plugin.onContractDeployed;
  if (hook === undefined) throw new Error("routescan plugin must define onContractDeployed");
  return hook(ctx, deps);
};

const makeVerifyCtx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  deployment,
  metadata,
  ...over,
});

/** Invoke the after-the-fact hook `deployoor verify` calls. */
const runVerify = (plugin: ReturnType<typeof routescan>, ctx: VerifyContext, deps: PluginDeps) => {
  const hook = plugin.onVerify;
  if (hook === undefined) throw new Error("routescan plugin must define onVerify");
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

const urlOf = (fetch: ReturnType<typeof makeDeps>["fetch"], index: number): string => {
  const call = fetch.mock.calls.at(index);
  if (call === undefined) throw new Error(`no fetch call at index ${index}`);
  return String(call[0]);
};

const requireParam = (params: URLSearchParams, key: string): string => {
  const value = params.get(key);
  if (value === null) throw new Error(`missing form field ${key}`);
  return value;
};

const plugin = (over: Partial<RoutescanOptions> = {}) => routescan({ pollIntervalMs: 0, ...over });

/** The record's chain is 8453 (Base mainnet); this one is a testnet viem knows. */
const sepoliaCtx = () => makeCtx({ deployment: { ...deployment, chainId: 11155111 } });

describe("routescan plugin", () => {
  it("submits a standard-json verification to the chain's own path", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    const { url, method, params } = formOf(fetch, 0);
    expect(url).toBe("https://api.routescan.io/v2/network/mainnet/evm/8453/etherscan/api");
    expect(method).toBe("POST");
    expect(params.get("action")).toBe("verifysourcecode");
    expect(params.get("codeformat")).toBe("solidity-standard-json-input");
    expect(params.get("contractaddress")).toBe(deployment.address);
    expect(params.get("contractname")).toBe("contracts/Token.sol:Token");
    expect(params.get("compilerversion")).toBe("v0.8.24+commit.e11b9ed9"); // v-prefixed
    expect(JSON.parse(requireParam(params, "sourceCode")).language).toBe("Solidity");
    expect(params.get("constructorArguments")).toBe(encodeAbiParameters(abi[0].inputs, args).slice(2));
    // The chain id is in the path, so it is not also a query parameter the way Etherscan V2 needs.
    expect(params.get("chainid")).toBeNull();
  });

  it("puts a testnet chain on the testnet path, from viem's own chain metadata", async () => {
    // Routescan keeps two indexes and the segment is part of the URL, so the wrong one answers about a
    // chain the contract is not on — for a Sepolia address, `mainnet` returns an empty result that
    // reads exactly like "not verified". viem marks testnets with `testnet: true`, so this needs no
    // table of our own and no configuration.
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), sepoliaCtx(), deps);

    expect(urlOf(fetch, 0)).toBe("https://api.routescan.io/v2/network/testnet/evm/11155111/etherscan/api");
  });

  it.each([
    ["Base", 8453, "mainnet"],
    ["Base Sepolia", 84532, "testnet"],
    ["Ethereum", 1, "mainnet"],
    ["Sepolia", 11155111, "testnet"],
    ["Avalanche", 43114, "mainnet"],
    ["Avalanche Fuji", 43113, "testnet"],
  ])("routes %s (%i) to the %s index", async (_label, chainId, network) => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx({ deployment: { ...deployment, chainId } }), deps);

    expect(urlOf(fetch, 0)).toBe(
      `https://api.routescan.io/v2/network/${network}/evm/${chainId}/etherscan/api`,
    );
  });

  it("falls back to mainnet for a chain viem does not know", async () => {
    // Unknown is not the same as wrong: mainnet is the larger index, and `network` is the override.
    // 424242424242 rather than a plausible-looking id, because the obvious candidates are all taken —
    // 999999999 is Zora Sepolia and 31337 is Anvil, so picking one of those tests the opposite branch
    // while looking like it tests this one. That is how the first version of this test failed.
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx({ deployment: { ...deployment, chainId: 424_242_424_242 } }), deps);

    expect(urlOf(fetch, 0)).toBe(
      "https://api.routescan.io/v2/network/mainnet/evm/424242424242/etherscan/api",
    );
  });

  it("lets an explicit network override what the chain id implies", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    // Sepolia would resolve to testnet on its own.
    await run(plugin({ network: "mainnet" }), sepoliaCtx(), deps);

    expect(urlOf(fetch, 0)).toBe("https://api.routescan.io/v2/network/mainnet/evm/11155111/etherscan/api");
  });

  it("uses apiUrl verbatim when given, ignoring the derived path", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin({ apiUrl: "https://routescan.test/custom/api" }), sepoliaCtx(), deps);

    expect(urlOf(fetch, 0)).toBe("https://routescan.test/custom/api");
    expect(urlOf(fetch, 1)).toContain("https://routescan.test/custom/api?");
  });

  it("omits apikey entirely when none is given, rather than sending a blank one", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    expect(formOf(fetch, 0).params.has("apikey")).toBe(false);
    expect(queryOf(fetch, 1).has("apikey")).toBe(false);
  });

  it("sends the apikey on both calls when one is given", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin({ apiKey: "KEY" }), makeCtx(), deps);

    expect(formOf(fetch, 0).params.get("apikey")).toBe("KEY");
    expect(queryOf(fetch, 1).get("apikey")).toBe("KEY");
  });

  it("treats an already-verified reply as success", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(
      reply({ status: "0", message: "NOTOK", result: "Contract source code already verified" }),
    );

    await run(plugin(), makeCtx(), deps);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deps.log.info).toHaveBeenCalledWith("[routescan] contracts/Token.sol:Token already verified");
  });

  it("re-submits while Routescan has not indexed the contract yet", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(
      reply({ status: "0", message: "NOTOK", result: "Unable to locate ContractCode at 0xabc" }),
    );
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(formOf(fetch, 1).params.get("action")).toBe("verifysourcecode");
    expect(queryOf(fetch, 2).get("action")).toBe("checkverifystatus");
  });

  it("does not read a reply that merely contains the word verified as success", async () => {
    // `/^pass|verified/i` parses as `(^pass)|(verified)` — the second alternative is unanchored — so
    // "Contract source code not verified" matched it and reported success on a contract that is not
    // verified. Found while checking a live run against the explorer's own read endpoint rather than
    // trusting our log line.
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "0", result: "Contract source code not verified" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await run(plugin(), makeCtx(), deps);

    // Three calls: the not-verified reply is not a conclusion, so it polled again.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["Pass - Verified", true],
    ["Verified", true],
    ["pass", true],
  ])("treats %s as a settled pass", async (result, _ok) => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result }));

    await run(plugin(), makeCtx(), deps);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects with the explorer's reason when verification fails", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "0", result: "Fail - Unable to verify" }));

    await expect(run(plugin(), makeCtx(), deps)).rejects.toThrow(/Fail - Unable to verify/);
  });

  it("gives up rather than polling forever", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockImplementationOnce(async () => reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockImplementation(async () => reply({ status: "0", result: "Pending in queue" }));

    await expect(run(plugin({ maxPolls: 3 }), makeCtx(), deps)).rejects.toThrow(/timed out/);

    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 2.5],
    ["NaN, which is what Number() of an unset env var gives", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects a maxPolls that is %s, naming the option", async (_label, maxPolls) => {
    const { deps, fetch } = makeDeps();

    await expect(run(plugin({ maxPolls }), makeCtx(), deps)).rejects.toThrow(
      /maxPolls must be a positive integer/,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips a reused deployment that has no artifact metadata", async () => {
    const { deps, fetch } = makeDeps();

    await run(plugin(), makeCtx({ metadata: undefined, reused: true }), deps);

    expect(fetch).not.toHaveBeenCalled();
    expect(deps.log.info).toHaveBeenCalledWith("[routescan] no artifact metadata for Token, skipping");
  });

  it("verifies a recorded deployment through onVerify", async () => {
    const { deps, fetch } = makeDeps();
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "guid-1" }));
    fetch.mockResolvedValueOnce(reply({ status: "1", message: "OK", result: "Pass - Verified" }));

    await runVerify(plugin(), makeVerifyCtx({ deployment: { ...deployment, chainId: 11155111 } }), deps);

    expect(urlOf(fetch, 0)).toBe("https://api.routescan.io/v2/network/testnet/evm/11155111/etherscan/api");
    expect(formOf(fetch, 0).params.get("contractaddress")).toBe(deployment.address);
  });
});
