import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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

/** Every field a package.json can declare a dependency under. */
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  // Both count as the project having said it wants this package, which is the question here rather
  // than whether it happens to be installed. optionalDependencies are installed by default anyway,
  // and a peer declaration is a deliberate statement of intent — nagging either to "add a dependency
  // you already declared" is noise.
  "peerDependencies",
  "optionalDependencies",
] as const;

/** Whether `name` is declared anywhere in the project's package.json. */
export const hasDependency = (root: string, name: string): boolean => {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return false;
  const parsed: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
  const manifest = parsed as Partial<Record<(typeof DEPENDENCY_FIELDS)[number], Record<string, string>>>;
  return DEPENDENCY_FIELDS.some((field) => manifest[field]?.[name] !== undefined);
};

/** What the generated deployers import, so generating without them yields a tree that cannot build. */
export const REQUIRED_DEPENDENCIES = ["deployoor", "viem"] as const;

/** `dir` and every directory above it, nearest first. */
const ancestors = (dir: string): readonly string[] => {
  const parent = dirname(dir);
  return parent === dir ? [dir] : [dir, ...ancestors(parent)];
};

/**
 * Whether `name` is installed somewhere the generated deployers' import would find it.
 *
 * Declaration alone is the wrong test: a package inside a workspace legitimately gets `viem` from an
 * ancestor's dependencies without declaring it, and the emitted import resolves fine — but a
 * declaration-only check calls it missing, which prompts for nothing interactively and *fails the run*
 * in CI.
 *
 * This walks `node_modules` by hand rather than calling `require.resolve`, deliberately.
 * `require.resolve` also consults `NODE_PATH` and Node's global folders, which makes it answer "is
 * this importable from somewhere on this machine" rather than "from this project" — vitest sets
 * `NODE_PATH` to the pnpm store, so under test every package resolves from any directory at all and
 * the check could never be exercised. `Module.globalPaths` is read once at startup, so no amount of
 * env stubbing fixes that. The walk is deterministic and matches what the import actually does.
 */
const installedNear = (root: string, name: string): boolean =>
  ancestors(resolve(root)).some((dir) => existsSync(join(dir, "node_modules", name, "package.json")));

/**
 * Which of `REQUIRED_DEPENDENCIES` the project neither declares nor has installed nearby. Declared is
 * checked first: it is one file read, and a declared-but-not-yet-installed dependency should not be
 * reported as missing either — the user's next step is `install`, not adding a dependency they have.
 */
export const missingDependencies = (root: string): readonly string[] =>
  REQUIRED_DEPENDENCIES.filter((name) => !hasDependency(root, name) && !installedNear(root, name));

/** Whether `deployoor` is a declared dependency of the project (not just present via npx). */
export const isDeployoorInstalled = (root: string): boolean => hasDependency(root, "deployoor");
