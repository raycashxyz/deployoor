import { z } from "zod";
import type { Abi, Address, Hex } from "viem";

/**
 * Zod schemas are the single source of truth for every value that crosses a
 * boundary (config files, compiled artifacts, deployment records). Static types
 * are derived with `z.infer`, and runtime validation happens at the edges; Zod
 * failures are mapped into tagged errors inside the engine.
 *
 * Note: abitype ships zod schemas (`abitype/zod`), but its 1.2.x types are written
 * against zod 3 — e.g. its `Address` is `z.ZodEffects<...>`, and `ZodEffects` was removed
 * in zod 4. deployoor needs zod 4 (tevm requires it), so `z.infer` over those schemas
 * collapses to `any` (runtime validation is fine; only the types break). These small
 * local validators infer precisely under zod 4; abitype's `Abi` *type* (via viem)
 * stays the source of truth for the abi shape.
 */

const hexRe = /^0x[0-9a-fA-F]*$/;
export const HexSchema = z.custom<Hex>((v) => typeof v === "string" && hexRe.test(v), "invalid hex string");

/**
 * Compiled init bytecode. Like `HexSchema`, but also admits solc's unlinked library
 * placeholders (`__$<hash>$__`), so a contract that links a library still gets a
 * generated deployer and a deployment record — the placeholder is replaced with the
 * library address at deploy time (see engine/link-libraries.ts). Transaction hashes and
 * addresses keep the strict `HexSchema`/`AddressSchema` validators.
 */
const bytecodeRe = /^0x[0-9a-fA-F_$]*$/;
export const BytecodeSchema = z.custom<Hex>(
  (v) => typeof v === "string" && bytecodeRe.test(v),
  "invalid bytecode",
);

const addressRe = /^0x[0-9a-fA-F]{40}$/;
export const AddressSchema = z.custom<Address>(
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
  bytecode: BytecodeSchema,
  deployedBytecode: BytecodeSchema,
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
  readonly bytecode: Hex;
  /** Runtime (deployed) bytecode — used for the metadata-stripped identity, not for deploying. */
  readonly deployedBytecode: Hex;
  readonly metadata: ContractMetadata;
}

export const Libraries = z.record(z.string(), AddressSchema);
export type Libraries = Record<string, Address>;

/**
 * Why a (re)deploy happened — recorded on each history entry so a PR diff shows the cause.
 * `changed` carries the component diffs; `fresh`/`forced`/`registered` are self-explanatory.
 */
export const IdentityChange = z.union([
  z.object({ field: z.literal("code") }),
  z.object({
    field: z.literal("library"),
    name: z.string(),
    from: AddressSchema.optional(),
    to: AddressSchema.optional(),
  }),
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
      readonly from?: Address; // absent when the library was added
      readonly to?: Address; // absent when the library was removed
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
  address: AddressSchema,
  transactionHash: HexSchema,
  deployer: AddressSchema,
  identityHash: HexSchema.optional(),
  reason: RedeployReason,
  summary: z.string(),
  supersededAddress: AddressSchema.optional(),
});
export interface DeploymentHistoryEntry {
  readonly at: number;
  readonly address: Address;
  readonly transactionHash: Hex;
  readonly deployer: Address;
  readonly identityHash?: Hex;
  readonly reason: RedeployReason;
  readonly summary: string;
  readonly supersededAddress?: Address;
}

export const DeploymentRecord = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(1),
  contractName: z.string(),
  deploymentName: z.string(),
  address: AddressSchema,
  chainId: z.number().int().positive(),
  networkName: z.string(),
  abi: AbiSchema,
  bytecode: BytecodeSchema,
  constructorArgs: z.array(z.unknown()),
  transactionHash: HexSchema,
  deployer: AddressSchema,
  deployedAt: z.number().int(),
  compiler: z.object({ version: z.string(), settings: z.unknown().optional() }),
  codeHash: HexSchema.optional(),
  identityHash: HexSchema.optional(),
  sourcesHash: HexSchema.optional(),
  libraries: Libraries.optional(),
  history: z.array(DeploymentHistoryEntry).default([]),
  kind: z.enum(["standard", "proxy", "external"]).default("standard"),
  implementation: AddressSchema.optional(),
});
// Explicit interface (not z.infer) for the type plugins and consumers import: a
// documented, stable, bundle-safe public boundary. The Zod schema above validates
// at runtime and its output is assignable to this.
export interface DeploymentRecord {
  readonly schemaVersion: 1 | 2;
  readonly contractName: string;
  readonly deploymentName: string;
  readonly address: Address;
  readonly chainId: number;
  readonly networkName: string;
  readonly abi: Abi;
  readonly bytecode: Hex;
  readonly constructorArgs: readonly unknown[];
  readonly transactionHash: Hex;
  readonly deployer: Address;
  readonly deployedAt: number;
  readonly compiler: { readonly version: string; readonly settings?: unknown };
  /**
   * keccak of the metadata-stripped runtime bytecode (v2+) — enough to answer "is the code at
   * this address still the code I recorded?" without the compiler, at 32 bytes instead of a
   * second copy of the bytecode. Absent on v1, and for a contract whose runtime bytecode still
   * carries unlinked library placeholders. Note it will not match `keccak(eth_getCode(...))` for
   * a contract with `immutable` variables, whose on-chain code has the values filled in.
   */
  readonly codeHash?: Hex;
  /** keccak(stripped runtime ++ args ++ libraries) — the redeploy key (v2+). Absent on v1. */
  readonly identityHash?: Hex;
  /** Points at the pinned verification sources in `deployments/sources/<hash>.json` (v2+). */
  readonly sourcesHash?: Hex;
  readonly libraries?: Record<string, Address>;
  /** Append-only (re)deploy log, newest last (v2+). Absent/empty on v1. */
  readonly history?: readonly DeploymentHistoryEntry[];
  readonly kind: "standard" | "proxy" | "external";
  readonly implementation?: Address;
}

/**
 * Verification input pinned at deploy time, so the contract stays verifiable on a block explorer
 * later — independent of the current source tree. Holds everything a standard-json verify needs
 * except the record's address / args / tx hash (those live in the record that references it).
 *
 * Stored content-addressed at `deployments/sources/<hash>.json` and committed with the records: a
 * standard-json input is the whole compilation unit, so addressing it by content is what keeps one
 * contract on six chains from meaning six copies of every source file.
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
