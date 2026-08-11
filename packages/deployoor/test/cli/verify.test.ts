import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeAbiParameters, keccak256, stringToBytes, type Hex } from "viem";
import { parseVerifyArgs, runVerify, VerifyRequestError, type VerifyArgs } from "../../src/cli/verify";
import { definePlugin, type PluginDeps, type VerifyContext } from "../../src/plugin";
import type { Config } from "../../src/config";
import type { DeploymentRecord, SourcesSidecar } from "../../src/schemas";
import { fsStore, memoryStore, type StoreAdapter } from "../../src/store";
import { COUNTER_ABI, COUNTER_BYTECODE } from "../fixtures";

const sidecar: SourcesSidecar = {
  schemaVersion: 1,
  fullyQualifiedName: "src/Counter.sol:Counter",
  compilerVersion: "0.8.35",
  standardJsonInput: {
    language: "Solidity",
    sources: { "src/Counter.sol": { content: "// Counter" } },
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
};

const sourcesHash: Hex = keccak256(stringToBytes(JSON.stringify(sidecar)));

const record = (over: Partial<DeploymentRecord> = {}): DeploymentRecord => ({
  schemaVersion: 2,
  contractName: "Counter",
  deploymentName: "Counter",
  address: "0x00000000000000000000000000000000000000c0",
  chainId: 11155111,
  networkName: "11155111-sepolia",
  abi: COUNTER_ABI,
  bytecode: COUNTER_BYTECODE,
  constructorArgs: [7n, "0x000000000000000000000000000000000000dEaD"],
  transactionHash: "0xabababababababababababababababababababababababababababababababab",
  deployer: "0x000000000000000000000000000000000000dead",
  deployedAt: 0,
  compiler: { version: "0.8.35" },
  sourcesHash,
  kind: "standard",
  ...over,
});

type PluginName = "etherscan" | "sourcify" | "slack";

/** A stand-in verifier: the same `onVerify` hook shape the real Etherscan/Sourcify plugins use. */
const stubVerifier = (name: PluginName, hook: (ctx: VerifyContext) => void = () => {}) =>
  definePlugin<typeof name, Record<string, never>>({ name, onVerify: (ctx) => hook(ctx) });

const failingVerifier = (name: PluginName, message: string) =>
  definePlugin<typeof name, Record<string, never>>({
    name,
    onVerify: () => {
      throw new Error(message);
    },
  });

/** A deploy-only plugin (a notifier): it has `onContractDeployed` but no `onVerify`. */
const stubNotifier = (name: PluginName, hook: () => void) =>
  definePlugin<typeof name, Record<string, never>>({ name, onContractDeployed: () => hook() });

const quietDeps = (): Partial<PluginDeps> => ({ log: { info: vi.fn(), warn: vi.fn() } });

const seeded = async (
  records: ReadonlyArray<DeploymentRecord>,
  sources: ReadonlyArray<readonly [Hex, SourcesSidecar]> = [[sourcesHash, sidecar]],
): Promise<StoreAdapter> => {
  const store = memoryStore([...records]);
  await Promise.all(sources.map(([hash, srcs]) => store.writeSources?.(hash, srcs)));
  return store;
};

/**
 * A store with no `listAll` — the optional method is not part of the required `StoreAdapter`
 * surface, so a custom backend may legitimately implement only per-network `list`.
 */
const listOnlyStore = async (records: ReadonlyArray<DeploymentRecord>): Promise<StoreAdapter> => {
  const inner = await seeded(records);
  return {
    read: inner.read,
    write: inner.write,
    list: inner.list,
    remove: inner.remove,
    readSources: inner.readSources,
  };
};

const run = (store: StoreAdapter, config: Config, args: VerifyArgs = {}) =>
  runVerify({ root: "/nowhere", config, store, deps: quietDeps(), ...args });

const spy = () => vi.fn<(ctx: VerifyContext) => void>();

/** What `@deployoor/etherscan` does with the record it is handed, verbatim. */
const encodeCtorArgs = (deployment: DeploymentRecord): Hex => {
  const ctor = deployment.abi.find((item) => item.type === "constructor");
  if (ctor === undefined || ctor.type !== "constructor") throw new Error("recorded abi has no constructor");
  return encodeAbiParameters(ctor.inputs, [...deployment.constructorArgs]);
};

describe("runVerify", () => {
  it("verifies each record through the configured plugins with the pinned sidecar as metadata", async () => {
    const seen = spy();
    const store = await seeded([record()]);
    const report = await run(store, { plugins: [stubVerifier("etherscan", seen)] });

    expect(report.ok).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.outcome).toEqual({ status: "verified", plugins: ["etherscan"] });
    expect(seen).toHaveBeenCalledTimes(1);
    // the whole VerifyContext, exactly: no `reused`, no `receipt`, metadata always present
    expect(seen).toHaveBeenCalledWith({
      deployment: record(),
      options: {},
      metadata: {
        fullyQualifiedName: "src/Counter.sol:Counter",
        compilerVersion: "0.8.35",
        standardJsonInput: sidecar.standardJsonInput,
        libraryPlaceholders: {},
      },
    });
  });

  it("skips a configured plugin that implements no onVerify hook", async () => {
    const notified = vi.fn();
    const store = await seeded([record()]);
    const report = await run(store, {
      plugins: [stubVerifier("etherscan"), stubNotifier("slack", notified)],
    });

    expect(report.ok).toBe(true);
    // a notifier is neither run nor reported — it is not a verifier
    expect(notified).not.toHaveBeenCalled();
    expect(report.plugins).toEqual(["etherscan"]);
    expect(report.results[0]?.outcome).toEqual({ status: "verified", plugins: ["etherscan"] });
  });

  it("rejects with a no-plugins VerifyRequestError when every configured plugin is deploy-only", async () => {
    const store = await seeded([record()]);
    const error = await run(store, { plugins: [stubNotifier("slack", vi.fn())] }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(VerifyRequestError);
    expect(error).toMatchObject({ kind: "no-plugins" });
    // names what IS configured, so "add a verifier" is actionable
    expect(error instanceof Error ? error.message : "").toContain("configured: slack");
  });

  it("runs every configured verifier for one record", async () => {
    const store = await seeded([record()]);
    const report = await run(store, {
      plugins: [stubVerifier("etherscan"), stubVerifier("sourcify")],
    });

    expect(report.plugins).toEqual(["etherscan", "sourcify"]);
    expect(report.results[0]?.outcome).toEqual({
      status: "verified",
      plugins: ["etherscan", "sourcify"],
    });
  });

  it("reports a record with no sourcesHash as unverifiable and still verifies the others", async () => {
    const seen = spy();
    const store = await seeded([
      record(),
      record({ deploymentName: "Legacy", schemaVersion: 1, sourcesHash: undefined }),
    ]);
    const report = await run(store, { plugins: [stubVerifier("etherscan", seen)] });

    expect(report.ok).toBe(false);
    expect(report.results.map((r) => [r.deploymentName, r.outcome.status])).toEqual([
      ["Counter", "verified"],
      ["Legacy", "unverifiable"],
    ]);
    const legacy = report.results[1]?.outcome;
    expect(legacy?.status === "unverifiable" ? legacy.detail : "").toContain("no sourcesHash");
    expect(seen).toHaveBeenCalledTimes(1); // the unverifiable record never reaches a plugin
  });

  it("reports a record whose pinned sources blob is missing as unverifiable", async () => {
    const store = await seeded([record()], []); // record points at a hash nothing wrote
    const report = await run(store, { plugins: [stubVerifier("etherscan")] });

    expect(report.ok).toBe(false);
    const outcome = report.results[0]?.outcome;
    expect(outcome?.status).toBe("unverifiable");
    expect(outcome?.status === "unverifiable" ? outcome.detail : "").toContain("missing");
  });

  it("reports which plugin failed and marks the run not ok", async () => {
    const store = await seeded([record()]);
    const report = await run(store, {
      plugins: [failingVerifier("etherscan", "Fail - Unable to verify"), stubVerifier("sourcify")],
    });

    expect(report.ok).toBe(false);
    expect(report.results[0]?.outcome).toEqual({
      status: "failed",
      plugins: ["etherscan", "sourcify"],
      failures: [{ plugin: "etherscan", error: "Fail - Unable to verify" }],
    });
  });

  it("skips an externally registered contract without failing the run", async () => {
    const seen = spy();
    const store = await seeded([
      record({ deploymentName: "USDC", kind: "external", sourcesHash: undefined }),
    ]);
    const report = await run(store, { plugins: [stubVerifier("etherscan", seen)] });

    expect(report.ok).toBe(true);
    expect(report.results[0]?.outcome.status).toBe("skipped");
    expect(seen).not.toHaveBeenCalled();
  });

  it("selects records by network key, chain id or slug", async () => {
    const records = [record(), record({ chainId: 8453, networkName: "8453-base" })];
    const names = async (network: string) =>
      (await run(await seeded(records), { plugins: [stubVerifier("etherscan")] }, { network })).results.map(
        (r) => r.networkName,
      );

    expect(await names("8453-base")).toEqual(["8453-base"]);
    expect(await names("8453")).toEqual(["8453-base"]);
    expect(await names("base")).toEqual(["8453-base"]);
    expect(await names("sepolia")).toEqual(["11155111-sepolia"]);
  });

  it("selects records by deployment name or contract name", async () => {
    const records = [record({ deploymentName: "CounterA" }), record({ deploymentName: "Other" })];
    const store = await seeded(records);
    const config = { plugins: [stubVerifier("etherscan")] };

    const byDeployment = await run(store, config, { contract: "countera" });
    expect(byDeployment.results.map((r) => r.deploymentName)).toEqual(["CounterA"]);

    // `contractName` is the same for both records, so naming it selects both
    const byContract = await run(store, config, { contract: "Counter" });
    expect(byContract.results.map((r) => r.deploymentName)).toEqual(["CounterA", "Other"]);
  });

  it("runs only the plugin named by --plugin", async () => {
    const skipped = spy();
    const store = await seeded([record()]);
    const report = await run(
      store,
      { plugins: [stubVerifier("etherscan"), stubVerifier("sourcify", skipped)] },
      { plugins: ["etherscan"] },
    );

    expect(report.plugins).toEqual(["etherscan"]);
    expect(skipped).not.toHaveBeenCalled();
  });

  it("rejects with a no-plugins VerifyRequestError when the config configures no plugins at all", async () => {
    const store = await seeded([record()]);
    const error = await run(store, {}).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(VerifyRequestError);
    expect(error).toMatchObject({ kind: "no-plugins" });
    expect(error instanceof Error ? error.message : "").toContain("configures no plugins");
  });

  it("rejects with an unknown-plugin VerifyRequestError when --plugin names nothing configured", async () => {
    const store = await seeded([record()]);
    const error = await run(store, { plugins: [stubVerifier("etherscan")] }, { plugins: ["sourcify"] }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(VerifyRequestError);
    expect(error).toMatchObject({ kind: "unknown-plugin" });
  });

  it("rejects with an unknown-plugin VerifyRequestError when --plugin names a deploy-only plugin", async () => {
    const notified = vi.fn();
    const store = await seeded([record()]);
    const error = await run(
      store,
      { plugins: [stubVerifier("etherscan"), stubNotifier("slack", notified)] },
      { plugins: ["slack"] },
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(VerifyRequestError);
    expect(error).toMatchObject({ kind: "unknown-plugin" });
    expect(notified).not.toHaveBeenCalled();
  });

  it("rejects with a no-records VerifyRequestError, naming what is there, when the filters match nothing", async () => {
    const store = await seeded([record()]);
    const error = await run(store, { plugins: [stubVerifier("etherscan")] }, { contract: "Ghost" }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(VerifyRequestError);
    expect(error).toMatchObject({ kind: "no-records" });
    expect(error instanceof Error ? error.message : "").toContain("11155111-sepolia/Counter");
  });

  it("rejects with store-cannot-list when a store cannot list every network and no --network narrows it", async () => {
    const store = await listOnlyStore([record()]);
    const error = await run(store, { plugins: [stubVerifier("etherscan")] }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(VerifyRequestError);
    expect(error).toMatchObject({ kind: "store-cannot-list" });

    const narrowed = await run(
      store,
      { plugins: [stubVerifier("etherscan")] },
      { network: "11155111-sepolia" },
    );
    expect(narrowed.results[0]?.outcome.status).toBe("verified");
  });

  it.each(["sepolia", "11155111"])(
    "rejects with store-cannot-list, not no-records, when a list-only store is given %s",
    async (network) => {
      const store = await listOnlyStore([record()]);
      const error = await run(store, { plugins: [stubVerifier("etherscan")] }, { network }).catch(
        (cause: unknown) => cause,
      );

      // the defect this guards: `list("sepolia")` finds nothing, and reporting that as "no records"
      // blames the repo for a lookup the store never supported
      expect(error).toBeInstanceOf(VerifyRequestError);
      expect(error).toMatchObject({ kind: "store-cannot-list" });
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("cannot expand");
      expect(message).not.toContain("no deployment records");
    },
  );

  it("hands a plugin constructor args it can re-encode after a round-trip through disk", async () => {
    const root = mkdtempSync(join(tmpdir(), "deployoor-verify-"));
    try {
      const store = fsStore(root);
      const args = [2n ** 200n, "0x000000000000000000000000000000000000dEaD"] as const;
      await store.writeSources?.(sourcesHash, sidecar);
      await store.write(record({ constructorArgs: args }));

      const encoded = vi.fn<(calldata: Hex) => void>();
      const report = await run(store, {
        plugins: [stubVerifier("etherscan", (ctx) => encoded(encodeCtorArgs(ctx.deployment)))],
      });

      expect(report.ok).toBe(true);
      // the store wrote 2**200 as a decimal string; viem re-encodes it to the same calldata
      expect(encoded).toHaveBeenCalledWith(encodeCtorArgs(record({ constructorArgs: args })));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseVerifyArgs", () => {
  it("accepts `--flag value` and `--flag=value` for every filter", () => {
    expect(parseVerifyArgs(["--network", "8453-base", "--contract=Counter"])).toEqual({
      network: "8453-base",
      contract: "Counter",
    });
  });

  it("collects a repeated --plugin into a list", () => {
    expect(parseVerifyArgs(["--plugin", "etherscan", "--plugin=sourcify"])).toEqual({
      plugins: ["etherscan", "sourcify"],
    });
  });

  it("returns no filters for an empty argument list", () => {
    expect(parseVerifyArgs([])).toEqual({});
  });

  it("throws a bad-usage VerifyRequestError for an unknown option", () => {
    const parse = () => parseVerifyArgs(["--netwrok", "8453-base"]);
    expect(parse).toThrow(VerifyRequestError);
    expect(parse).toThrow(/--netwrok/);
  });

  it("throws a bad-usage VerifyRequestError when a flag is missing its value", () => {
    expect(() => parseVerifyArgs(["--network", "--plugin", "etherscan"])).toThrow(/--network needs a value/);
  });

  it("throws a bad-usage VerifyRequestError for a stray positional argument", () => {
    const parse = () => parseVerifyArgs(["Counter"]);
    expect(parse).toThrow(VerifyRequestError);
    expect(parse).toThrow(/unexpected argument/);
  });
});
