import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_TEMPLATE = `import { defineConfig } from "deployoor";

export default defineConfig({
  // include: ["Token", "Vault"],  // default: every contract with bytecode
  out: "./deployers",
  deploymentsPath: "./deployments",
  plugins: [],
});
`;

export interface InitResult {
  readonly configPath: string;
  readonly created: boolean;
}

/** Scaffold deployoor.config.ts if absent. Does not install anything. */
export const runInit = (root: string): InitResult => {
  const configPath = join(root, "deployoor.config.ts");
  const created = !existsSync(configPath);
  if (created) writeFileSync(configPath, CONFIG_TEMPLATE);
  return { configPath, created };
};

/** Whether `name` is a declared dependency of the project (not just resolvable via npx). */
export const hasDependency = (root: string, name: string): boolean => {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return false;
  const parsed: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = parsed as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return Boolean(deps.dependencies?.[name] ?? deps.devDependencies?.[name]);
};

/** What the generated deployers import, so generating without them yields a tree that cannot build. */
export const REQUIRED_DEPENDENCIES = ["deployoor", "viem"] as const;

/** Which of `REQUIRED_DEPENDENCIES` the project has not declared. */
export const missingDependencies = (root: string): readonly string[] =>
  REQUIRED_DEPENDENCIES.filter((name) => !hasDependency(root, name));

/** Whether `deployoor` is a declared dependency of the project (not just present via npx). */
export const isDeployoorInstalled = (root: string): boolean => hasDependency(root, "deployoor");
