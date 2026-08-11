import { Data } from "effect";

/**
 * Tagged errors are the engine's failure vocabulary. They travel in Effect's
 * error channel — never thrown, never caught with try/catch. Recovery is done
 * with `Effect.catchTag` / `Effect.catchAll` in the pipeline. Each carries a
 * readable `message` and (where relevant) the original `cause`, so when a
 * failure surfaces at the Promise edge the real reason is visible.
 */

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * A deploy transaction or its receipt failed. `cause` preserves the original
 * (a viem revert, an RPC error, gas/nonce issues, …) — deployoor does not classify
 * those; it adds the "which contract" context and surfaces the cause verbatim.
 */
export class DeploymentFailed extends Data.TaggedError("DeploymentFailed")<{
  readonly contract: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to deploy ${this.contract}: ${describe(this.cause)}`;
  }
}

export class LibrariesUnlinked extends Data.TaggedError("LibrariesUnlinked")<{
  readonly contract: string;
  readonly missing: ReadonlyArray<string>;
}> {
  override get message(): string {
    return `Cannot deploy ${this.contract}: missing libraries ${this.missing.join(", ")}`;
  }
}

/**
 * Why the artifacts could not be read. Without this the message can only guess, and it guessed
 * "compile first" — which is wrong, and unfixable-sounding, for the common case of a project that
 * did compile but writes its output somewhere other than `artifacts/` or `out/`.
 */
export type ArtifactsNotFoundContext =
  | { readonly kind: "no-toolchain"; readonly markers: string }
  | {
      readonly kind: "missing-output-dir";
      readonly framework: "hardhat" | "foundry" | "tevm";
      /** The file/dir that identified the toolchain; absent when `framework` came from config. */
      readonly marker?: string;
      /** Where `dir` came from, which decides what is worth suggesting. */
      readonly source: "configured" | "framework-config" | "default";
    };

const COMPILE_COMMAND = {
  hardhat: "npx hardhat compile",
  foundry: "forge build",
  tevm: "npx deployoor generate",
} as const;

/** Where each toolchain's own config puts the output dir, so the fix names the right knob. */
const OUTPUT_DIR_SETTING = {
  hardhat: "`paths.artifacts` in hardhat.config",
  foundry: "`out` in foundry.toml",
  tevm: "the sources dir",
} as const;

const FRAMEWORK_LABEL = { hardhat: "Hardhat", foundry: "Foundry", tevm: "tevm" } as const;

export class ArtifactsNotFound extends Data.TaggedError("ArtifactsNotFound")<{
  readonly dir: string;
  readonly context?: ArtifactsNotFoundContext;
}> {
  override get message(): string {
    const context = this.context;
    if (context === undefined) {
      return `No compiled artifacts found in ${this.dir}. Compile first with \`forge build\` or \`npx hardhat compile\`, then run \`deployoor generate\`.`;
    }

    if (context.kind === "no-toolchain") {
      return [
        `Could not tell what this project is built with, looking in ${this.dir}.`,
        ``,
        `deployoor looks for ${context.markers}.`,
        `  1. Wrong directory? \`deployoor generate\` reads the current working directory.`,
        `  2. Non-default layout? Name it yourself in deployoor.config.ts:`,
        `       export default defineConfig({ framework: "hardhat", artifactsPath: "./build/artifacts" })`,
      ].join("\n");
    }

    const label = FRAMEWORK_LABEL[context.framework];
    const compile = COMPILE_COMMAND[context.framework];

    if (context.source === "configured") {
      return [
        `No compiled artifacts in ${this.dir}.`,
        ``,
        `That path is the configured \`artifactsPath\`. Check it points at the`,
        `directory \`${compile}\` actually writes to.`,
      ].join("\n");
    }

    const detected = context.marker === undefined ? "set in deployoor.config.ts" : `found ${context.marker}`;

    // The directory came from the project's own config, so it is already the right answer to
    // "where do the artifacts go?" — nothing left to configure, it simply has not been built.
    if (context.source === "framework-config") {
      return [
        `No compiled artifacts in ${this.dir}.`,
        ``,
        `This is a ${label} project (${detected}), and that is the output directory its own config`,
        `sets (${OUTPUT_DIR_SETTING[context.framework]}), so nothing has compiled into it yet.`,
        `Run \`${compile}\`, then \`deployoor generate\`.`,
      ].join("\n");
    }

    return [
      `No compiled artifacts in ${this.dir}.`,
      ``,
      `This is a ${label} project (${detected}), so deployoor looked in the default output`,
      `directory. Either:`,
      `  1. Nothing compiled yet — run \`${compile}\`.`,
      `  2. The output lives elsewhere — deployoor reads ${OUTPUT_DIR_SETTING[context.framework]}`,
      `     when it can, so if that is set and this path is still wrong, name it directly:`,
      `       export default defineConfig({ artifactsPath: "./build/artifacts" })`,
    ].join("\n");
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class NoChainOnClient extends Data.TaggedError("NoChainOnClient")<{}> {
  override get message(): string {
    return "The viem client must have a chain configured (deploys also require an account)";
  }
}

/** `register` refused to overwrite an existing deployed record (reset it first, or use a new name). */
export class DeploymentExists extends Data.TaggedError("DeploymentExists")<{
  readonly network: string;
  readonly name: string;
}> {
  override get message(): string {
    return `A deployment named "${this.name}" already exists on ${this.network}; register won't overwrite a deployed record. Reset it first, or register under a different name.`;
  }
}

export class DeploymentChainMismatch extends Data.TaggedError("DeploymentChainMismatch")<{
  readonly deploymentName: string;
  readonly expectedChainId: number;
  readonly actualChainId: number;
}> {
  override get message(): string {
    return `Deployment "${this.deploymentName}" was recorded for chain ${this.actualChainId}, but the active client is on chain ${this.expectedChainId}.`;
  }
}

export class InvalidDeploymentRecord extends Data.TaggedError("InvalidDeploymentRecord")<{
  readonly path: string;
  readonly issues: string;
}> {
  override get message(): string {
    return `Invalid deployment record at ${this.path}: ${this.issues}`;
  }
}

/** One or more plugins failed and `onPluginError` was set to "throw". */
export class PluginFailed extends Data.TaggedError("PluginFailed")<{
  readonly plugins: ReadonlyArray<string>;
}> {
  override get message(): string {
    return `Plugin(s) failed: ${this.plugins.join(", ")}`;
  }
}
