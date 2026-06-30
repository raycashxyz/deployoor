import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, ContractConfig } from "@wagmi/cli";
import { Address as AddressSchema, Abi as AbiSchema } from "abitype/zod";
import { z } from "zod";

// The slice of a deployoor deployment record this plugin needs. deployoor writes the full
// record; we validate (and ignore) only what wagmi consumes, so the two packages
// stay decoupled — the `deployments/*.json` format is the contract between them.
const DeploymentRecord = z.object({
  contractName: z.string(),
  deploymentName: z.string(),
  abi: AbiSchema,
  address: AddressSchema,
  chainId: z.number().int().positive(),
});

const jsonFiles = (dir: string): readonly string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? jsonFiles(full) : full.endsWith(".json") ? [full] : [];
      })
    : [];

/**
 * Read a deployoor `deployments/` folder into `@wagmi/cli` contracts. Records that share
 * a deployment name are folded into one contract whose `address` maps chainId →
 * address, so the same contract across chains becomes a single multi-chain entry.
 */
export const readDeploymentContracts = (deploymentsPath: string): ContractConfig[] => {
  const records = jsonFiles(deploymentsPath).flatMap((file) => {
    const parsed = DeploymentRecord.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? [parsed.data] : [];
  });

  const byName = records.reduce<Record<string, ContractConfig>>((acc, rec) => {
    const prior = acc[rec.deploymentName];
    const address = {
      ...(typeof prior?.address === "object" ? prior.address : {}),
      [rec.chainId]: rec.address,
    };
    return {
      ...acc,
      [rec.deploymentName]: { name: rec.deploymentName, abi: prior?.abi ?? rec.abi, address },
    };
  }, {});

  return Object.values(byName);
};

/**
 * A `@wagmi/cli` plugin that sources contracts from a deployoor `deployments/` folder.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@wagmi/cli";
 * import { actions } from "@wagmi/cli/plugins";
 * import { deployments } from "@deployoor/wagmi";
 *
 * export default defineConfig({
 *   out: "src/generated.ts",
 *   plugins: [deployments({ path: "./deployments" }), actions()],
 * });
 * ```
 */
export const deployments = (options: { path?: string } = {}): Plugin => {
  const path = options.path ?? "./deployments";
  return {
    name: "deployoor-deployments",
    contracts: () => readDeploymentContracts(path),
  };
};
