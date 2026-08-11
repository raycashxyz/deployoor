import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { detectToolchain, type DetectedToolchain } from "../artifacts/detect";
import { readFoundryOutPath, readHardhatArtifactsPath } from "../artifacts/framework-config";

/** What deployoor resolved about this project, written into the scaffold so the user can check it. */
interface Detected {
  readonly toolchain: DetectedToolchain | null;
  /** The artifacts directory the framework's own config states, if it states one. */
  readonly artifactsPath?: string;
}

const detect = async (root: string): Promise<Detected> => {
  const toolchain = detectToolchain(root);
  if (toolchain?.framework === "hardhat") {
    const artifactsPath = await readHardhatArtifactsPath(root);
    return { toolchain, artifactsPath };
  }
  if (toolchain?.framework === "foundry") {
    return { toolchain, artifactsPath: readFoundryOutPath(root) };
  }
  return { toolchain };
};

/**
 * The two comment lines about where artifacts come from.
 *
 * `artifactsPath` is scaffolded **commented out**, even when the framework's config states a
 * non-default directory — because deployoor reads that config itself. Writing the value here would
 * copy a setting that already has an owner, and the copy is then free to drift from it. So the
 * scaffold shows what was resolved and leaves it unset, which is also the only way to tell the user
 * that they do not need to repeat themselves.
 */
const artifactsComment = ({ toolchain, artifactsPath }: Detected): ReadonlyArray<string> => {
  if (toolchain === null) {
    return [
      "  // No Foundry, Hardhat or Solidity sources detected in this directory.",
      '  // framework: "hardhat",',
      '  // artifactsPath: "./artifacts",',
    ];
  }
  if (toolchain.framework === "tevm") {
    return [
      `  // Detected: plain Solidity (${toolchain.marker}) — deployoor compiles the sources itself.`,
      '  // sources: "./src",',
    ];
  }
  const where =
    artifactsPath === undefined
      ? `the ${toolchain.framework} default`
      : `${artifactsPath} (from ${toolchain.marker})`;
  return [
    `  // Detected: ${toolchain.framework}, artifacts in ${where}.`,
    "  // deployoor reads that from your framework's own config, so leave this unset unless you",
    "  // want to override it.",
    `  // artifactsPath: ${JSON.stringify(artifactsPath ?? (toolchain.framework === "foundry" ? "./out" : "./artifacts"))},`,
  ];
};

const template = (detected: Detected): string =>
  [
    'import { defineConfig } from "deployoor";',
    "",
    "export default defineConfig({",
    ...artifactsComment(detected),
    "",
    '  out: "./deployers", // generated deployers — commit them',
    '  deploymentsPath: "./deployments", // the deployment record — commit it',
    '  // include: ["Token", "Vault"], // default: every contract with bytecode',
    "  plugins: [],",
    "});",
    "",
  ].join("\n");

export interface InitResult {
  readonly configPath: string;
  readonly created: boolean;
}

/**
 * Scaffold deployoor.config.ts if absent, filled in from what this project looks like rather than
 * from a fixed template — so the file confirms which toolchain deployoor found and where it will
 * read artifacts from. Installs nothing.
 */
export const runInit = async (root: string): Promise<InitResult> => {
  const configPath = join(root, "deployoor.config.ts");
  // `wx` rather than an existsSync guard: detection is async, so a check before it leaves a window in
  // which something else can create the config, and the write would then truncate whatever it wrote.
  // Exclusive creation makes "does it exist" and "claim it" the same operation.
  const contents = template(await detect(root));
  try {
    writeFileSync(configPath, contents, { flag: "wx" });
    return { configPath, created: true };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") return { configPath, created: false };
    throw cause;
  }
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
 * Whether the generated deployers' import of `name` will work from `root`: the project either declared
 * it, or it is installed somewhere the import would find it.
 *
 * Declared is checked first because it is one file read, and because a declared-but-not-yet-installed
 * dependency should not be reported as missing either — the next step there is `install`, not adding a
 * dependency the project already has.
 *
 * Every caller goes through this. Answering the question two different ways is what let the CLI accept
 * a workspace-hoisted dependency while `generateDeployers` rejected the same project.
 */
const isAvailable = (root: string, name: string): boolean =>
  hasDependency(root, name) || installedNear(root, name);

/** Which of `REQUIRED_DEPENDENCIES` the project can neither import nor claims to depend on. */
export const missingDependencies = (root: string): readonly string[] =>
  REQUIRED_DEPENDENCIES.filter((name) => !isAvailable(root, name));

/** Whether the generated deployers' `import … from "deployoor"` will resolve from `root`. */
export const isDeployoorInstalled = (root: string): boolean => isAvailable(root, "deployoor");
