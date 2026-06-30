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

export class ArtifactsNotFound extends Data.TaggedError("ArtifactsNotFound")<{
  readonly dir: string;
}> {
  override get message(): string {
    return `No compiled artifacts found in ${this.dir}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class NoChainOnClient extends Data.TaggedError("NoChainOnClient")<{}> {
  override get message(): string {
    return "The wallet client must have a chain and an account configured";
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
