import { z } from "zod";
import type { Abi } from "viem";

/**
 * Zod schemas are the single source of truth for every value that crosses a
 * boundary (config files, compiled artifacts, deployment records). Static types
 * are derived with `z.infer`, and runtime validation happens at the edges; Zod
 * failures are mapped into tagged errors inside the engine.
 *
 * Note: abitype ships zod schemas (`abitype/zod`), but its 1.2.x types are written
 * against zod 3 — e.g. `Address` is `z.ZodEffects<...>`, and `ZodEffects` was removed
 * in zod 4. deployoor needs zod 4 (tevm requires it), so `z.infer` over those schemas
 * collapses to `any` (runtime validation is fine; only the types break). These small
 * local validators infer precisely under zod 4; abitype's `Abi` *type* (via viem)
 * stays the source of truth for the abi shape.
 */

const hexRe = /^0x[0-9a-fA-F]*$/;
export const Hex = z.custom<`0x${string}`>(
  (v) => typeof v === "string" && hexRe.test(v),
  "invalid hex string",
);

/**
 * Compiled init bytecode. Like `Hex`, but also admits solc's unlinked library
 * placeholders (`__$<hash>$__`), so a contract that links a library still gets a
 * generated deployer and a deployment record — the placeholder is replaced with the
 * library address at deploy time (see engine/link-libraries.ts). Transaction hashes and
 * addresses keep the strict `Hex`/`Address` validators.
 */
const bytecodeRe = /^0x[0-9a-fA-F_$]*$/;
export const Bytecode = z.custom<`0x${string}`>(
  (v) => typeof v === "string" && bytecodeRe.test(v),
  "invalid bytecode",
);

const addressRe = /^0x[0-9a-fA-F]{40}$/;
export const Address = z.custom<`0x${string}`>(
  (v) => typeof v === "string" && addressRe.test(v),
  "invalid address",
);

export const AbiSchema = z.custom<Abi>((v) => Array.isArray(v), "invalid abi");

export const ContractMetadata = z.object({
  fullyQualifiedName: z.string(),
  compilerVersion: z.string(),
  standardJsonInput: z.object({
    // string (not a literal) so generated `satisfies TypedArtifact` compiles without `as const` gymnastics
    language: z.string(),
    sources: z.record(z.string(), z.object({ content: z.string() })),
    settings: z.record(z.string(), z.unknown()),
  }),
  libraryPlaceholders: z.record(z.string(), z.string()).default({}),
});
export type ContractMetadata = z.infer<typeof ContractMetadata>;

export const Artifact = z.object({
  name: z.string(),
  abi: AbiSchema,
  bytecode: Bytecode,
  deployedBytecode: Bytecode,
  metadata: ContractMetadata,
});
export type Artifact = z.infer<typeof Artifact>;

/**
 * Compile-time view of an artifact that carries the precise `abi` type `A`
 * (the runtime-validated `Artifact` is `TypedArtifact<Abi>`). Generated artifact
 * modules are emitted as `TypedArtifact<typeof abi>`, which lets the deployer
 * type constructor args and the returned contract per contract.
 */
export interface TypedArtifact<A extends Abi = Abi> {
  readonly name: string;
  readonly abi: A;
  readonly bytecode: `0x${string}`;
  /** Runtime (deployed) bytecode — used for the metadata-stripped identity, not for deploying. */
  readonly deployedBytecode: `0x${string}`;
  readonly metadata: ContractMetadata;
}

export const Libraries = z.record(z.string(), Address);
export type Libraries = Record<string, `0x${string}`>;

/**
 * Why a (re)deploy happened — recorded on each history entry so a PR diff shows the cause.
 * `changed` carries the component diffs; `fresh`/`forced`/`registered` are self-explanatory.
 */
export const IdentityChange = z.union([
  z.object({ field: z.literal("code") }),
  z.object({ field: z.literal("library"), name: z.string(), from: Address, to: Address }),
  z.object({
    field: z.literal("args"),
    from: z.array(z.unknown()),
    to: z.array(z.unknown()),
    changedIndices: z.array(z.number().int()),
  }),
]);
export type IdentityChange =
  | { readonly field: "code" }
  | {
      readonly field: "library";
      readonly name: string;
      readonly from: `0x${string}`;
      readonly to: `0x${string}`;
    }
  | {
      readonly field: "args";
      readonly from: readonly unknown[];
      readonly to: readonly unknown[];
      readonly changedIndices: readonly number[];
    };

export const RedeployReason = z.union([
  z.object({ kind: z.literal("fresh") }),
  z.object({ kind: z.literal("forced") }),
  z.object({ kind: z.literal("registered") }),
  z.object({ kind: z.literal("changed"), changes: z.array(IdentityChange) }),
]);
export type RedeployReason =
  | { readonly kind: "fresh" }
  | { readonly kind: "forced" }
  | { readonly kind: "registered" }
  | { readonly kind: "changed"; readonly changes: readonly IdentityChange[] };

/** One (re)deploy in a record's append-only history — newest last. */
export const DeploymentHistoryEntry = z.object({
  at: z.number().int(),
  address: Address,
  transactionHash: Hex,
  deployer: Address,
  identityHash: Hex.optional(),
  reason: RedeployReason,
  summary: z.string(),
  supersededAddress: Address.optional(),
});
export interface DeploymentHistoryEntry {
  readonly at: number;
  readonly address: `0x${string}`;
  readonly transactionHash: `0x${string}`;
  readonly deployer: `0x${string}`;
  readonly identityHash?: `0x${string}`;
  readonly reason: RedeployReason;
  readonly summary: string;
  readonly supersededAddress?: `0x${string}`;
}

export const DeploymentRecord = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(1),
  contractName: z.string(),
  deploymentName: z.string(),
  address: Address,
  chainId: z.number().int().positive(),
  networkName: z.string(),
  abi: AbiSchema,
  bytecode: Bytecode,
  deployedBytecode: Bytecode.optional(),
  constructorArgs: z.array(z.unknown()),
  transactionHash: Hex,
  deployer: Address,
  deployedAt: z.number().int(),
  compiler: z.object({ version: z.string(), settings: z.unknown().optional() }),
  identityHash: Hex.optional(),
  libraries: Libraries.optional(),
  history: z.array(DeploymentHistoryEntry).default([]),
  kind: z.enum(["standard", "proxy", "external"]).default("standard"),
  implementation: Address.optional(),
});
// Explicit interface (not z.infer) for the type plugins and consumers import: a
// documented, stable, bundle-safe public boundary. The Zod schema above validates
// at runtime and its output is assignable to this.
export interface DeploymentRecord {
  readonly schemaVersion: 1 | 2;
  readonly contractName: string;
  readonly deploymentName: string;
  readonly address: `0x${string}`;
  readonly chainId: number;
  readonly networkName: string;
  readonly abi: Abi;
  readonly bytecode: `0x${string}`;
  /** Runtime (deployed) bytecode (v2+); absent on legacy v1 records. */
  readonly deployedBytecode?: `0x${string}`;
  readonly constructorArgs: readonly unknown[];
  readonly transactionHash: `0x${string}`;
  readonly deployer: `0x${string}`;
  readonly deployedAt: number;
  readonly compiler: { readonly version: string; readonly settings?: unknown };
  /** keccak(stripped runtime ++ args ++ libraries) — the redeploy key (v2+). Absent on v1. */
  readonly identityHash?: `0x${string}`;
  readonly libraries?: Record<string, `0x${string}`>;
  /** Append-only (re)deploy log, newest last (v2+). Absent/empty on v1. */
  readonly history?: readonly DeploymentHistoryEntry[];
  readonly kind: "standard" | "proxy" | "external";
  readonly implementation?: `0x${string}`;
}

/**
 * Verification input pinned beside a deployment record (`<Name>.sources.json`) at deploy time,
 * so the contract stays verifiable on a block explorer forever — independent of the current
 * source tree. Holds everything a standard-json verify needs except the record's address / args
 * / tx hash (those live in the sibling record). Committed alongside `deployments/`.
 */
export const SourcesSidecar = z.object({
  schemaVersion: z.literal(1).default(1),
  fullyQualifiedName: z.string(),
  compilerVersion: z.string(),
  standardJsonInput: ContractMetadata.shape.standardJsonInput,
});
export interface SourcesSidecar {
  readonly schemaVersion: 1;
  readonly fullyQualifiedName: string;
  readonly compilerVersion: string;
  readonly standardJsonInput: ContractMetadata["standardJsonInput"];
}
