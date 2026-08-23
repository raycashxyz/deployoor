import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGenerate } from "../../src/cli/generate";

const pkgRoot = join(import.meta.dirname, "..", "..");
const hhRoot = join(pkgRoot, "test", "fixtures", "hh");
const distTypes = join(pkgRoot, "dist", "index.d.mts");
const requireFromTest = createRequire(import.meta.url);
const tscBin = requireFromTest.resolve("typescript/bin/tsc");
const tsdownBin = requireFromTest.resolve("tsdown/run");

/** Newest mtime under `dir`, recursively. */
const newestMtime = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true })
    .map((entry) =>
      entry.isDirectory() ? newestMtime(join(dir, entry.name)) : statSync(join(dir, entry.name)).mtimeMs,
    )
    .reduce((newest, mtime) => Math.max(newest, mtime), 0);

/**
 * Rebuild when `dist` is missing *or* older than `src`. Existence alone is not enough: this suite
 * type-checks emitted code against `dist/index.d.mts`, so a stale dist means it validates the
 * generated tree against a signature the source no longer has — it passes while genuinely broken.
 * `deployoor:test` does not depend on `deployoor:build` (turbo's `^build` covers dependencies, not
 * the package itself), so nothing else guarantees freshness locally.
 */
const ensureBuilt = (): void => {
  const built = existsSync(distTypes) ? statSync(distTypes).mtimeMs : 0;
  if (built > newestMtime(join(pkgRoot, "src"))) return;
  execFileSync(process.execPath, [tsdownBin], { cwd: pkgRoot, stdio: "ignore" });
};

// The codegen spine: prove the emitted deployers + artifact modules + the config
// import actually compile against deployoor's published types (catches template bugs a
// content assertion can't — wrong imports, a broken `satisfies`, signature drift).
describe("generated deployers type-check against deployoor", () => {
  beforeAll(() => {
    // dist/index.d.mts is what the emitted code resolves `deployoor` to.
    ensureBuilt();
  }, 120_000);

  const runTsc = (project: string): string => {
    try {
      execFileSync(process.execPath, [tscBin, "-p", join(project, "tsconfig.json")], { stdio: "pipe" });
      return "";
    } catch (error) {
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      return `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
  };

  // The two resolution modes the emitted tree has to satisfy, each with the extension form
  // deployoor emits for it. `bundler` is the common tsx/Vite setup and takes extensionless
  // specifiers; `node16` is strict-ESM and Hardhat 3's default, and *rejects* them (TS2835/TS2307),
  // so it gets `.js`.
  //
  // Only the node16 row is asymmetric: tsc accepts `.js` under `bundler` too (it substitutes back to
  // `.ts`), so this suite would still pass if extensions were emitted unconditionally. What rules
  // that out is not tsc but runtime resolution — webpack without `resolve.extensionAlias` and
  // ts-jest without a `moduleNameMapper` fail on a `.js` specifier — which is why the emitted form
  // tracks the project instead of always taking the superset. `import-extension.test.ts` pins that
  // decision; this suite pins that each form compiles where it is emitted.
  const RESOLUTIONS = [
    { moduleResolution: "bundler", module: "esnext", esm: false, importExtension: "none" },
    { moduleResolution: "node16", module: "node16", esm: true, importExtension: "js" },
  ] as const;

  /** Generate into a throwaway project — with or without a config file — and tsc the result. */
  const typecheckEmitted = async ({
    withConfig,
    resolution,
    consumer,
  }: {
    withConfig: boolean;
    resolution: (typeof RESOLUTIONS)[number];
    /** A caller-side script to compile alongside the emitted tree, for asserting call ergonomics. */
    consumer?: string;
  }): Promise<string> => {
    const project = mkdtempSync(join(tmpdir(), "deployoor-tsc-"));
    const configPath = join(project, "deployoor.config.ts");
    await runGenerate({
      root: hhRoot,
      out: join(project, "deployers"),
      importExtension: resolution.importExtension,
      ...(withConfig ? { configPath } : {}),
    });
    if (withConfig) {
      writeFileSync(
        configPath,
        'import { defineConfig } from "deployoor";\nexport default defineConfig({});\n',
      );
    }
    // node16 only demands extensions on files that are ESM, which is what makes this the real
    // Hardhat 3 shape rather than a config that happens to pass.
    if (resolution.esm) {
      writeFileSync(join(project, "package.json"), JSON.stringify({ type: "module" }));
    }
    // A consumer script names viem's client types directly, the way a real deploy script does,
    // so it needs viem resolvable from the project rather than only from deployoor's dist.
    if (consumer !== undefined) {
      writeFileSync(join(project, "consumer.ts"), consumer);
      symlinkSync(join(pkgRoot, "node_modules"), join(project, "node_modules"), "dir");
    }
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: resolution.module,
          moduleResolution: resolution.moduleResolution,
          target: "es2022",
          noEmit: true,
          skipLibCheck: true,
          baseUrl: ".",
          paths: { deployoor: [distTypes] },
        },
        include: [
          "deployers/**/*.ts",
          ...(withConfig ? ["deployoor.config.ts"] : []),
          ...(consumer === undefined ? [] : ["consumer.ts"]),
        ],
      }),
    );

    return runTsc(project);
  };

  RESOLUTIONS.forEach((resolution) => {
    it(`compiles the emitted deployers, artifact modules, and config under ${resolution.moduleResolution}`, async () => {
      const diagnostics = await typecheckEmitted({ withConfig: true, resolution });
      expect(diagnostics, diagnostics).toBe("");
    }, 60_000);

    // The zero-config path: no deployoor.config.* anywhere, so the deployers carry `{} satisfies
    // Config` inline. Proves the inlined defaults satisfy the same signature the imported config does.
    it(`compiles the emitted deployers with no config file under ${resolution.moduleResolution}`, async () => {
      const diagnostics = await typecheckEmitted({ withConfig: false, resolution });
      expect(diagnostics, diagnostics).toBe("");
    }, 60_000);
  });

  // The call-site half of the spine: the emitted deployers compiling says nothing about what a
  // deploy script can write against the result. Both assertions are two-sided — a regression that
  // widened the contract type back out would fail the write calls, and one that dropped the
  // read-only narrowing would leave the `@ts-expect-error` unused, which tsc also reports.
  //
  // Pinned under `bundler` only: this is about the contract types, and module resolution is
  // already covered above.
  const CONSUMER = `
import type { PublicClient, WalletClient } from "viem";
import { getOrDeployCounter, register } from "./deployers";

declare const walletClient: WalletClient;
declare const publicClient: PublicClient;
const owner = "0x0000000000000000000000000000000000000001" as const;

const counterAbi = [
  { type: "function", name: "increment", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// A deployed contract's account and chain are bound, so a write takes no second argument.
export const deployed = async () => {
  const { contract } = await getOrDeployCounter({ walletClient, publicClient, args: [1n, owner] });
  await contract.write.increment();
  const count: bigint = await contract.read.count();
  return count;
};

export const registered = async () => {
  const writable = await register({
    walletClient,
    publicClient,
    deploymentName: "Counter",
    address: owner,
    abi: counterAbi,
  });
  await writable.contract.write.increment();

  const readOnly = await register({
    publicClient,
    deploymentName: "Counter",
    address: owner,
    abi: counterAbi,
  });
  const count: bigint = await readOnly.contract.read.count();
  // @ts-expect-error no wallet client was passed, so the contract has no write namespace
  readOnly.contract.write.increment();
  return count;
};
`;

  it("compiles a deploy script that writes without passing account and chain", async () => {
    const diagnostics = await typecheckEmitted({
      withConfig: true,
      resolution: RESOLUTIONS[0],
      consumer: CONSUMER,
    });
    expect(diagnostics, diagnostics).toBe("");
  }, 60_000);
});
