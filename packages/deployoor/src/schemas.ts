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
  bytecode: Hex,
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
  readonly metadata: ContractMetadata;
}

export const Libraries = z.record(z.string(), Address);
export type Libraries = Record<string, `0x${string}`>;

export const DeploymentRecord = z.object({
  contractName: z.string(),
  deploymentName: z.string(),
  address: Address,
  chainId: z.number().int().positive(),
  networkName: z.string(),
  abi: AbiSchema,
  bytecode: Hex,
  constructorArgs: z.array(z.unknown()),
  transactionHash: Hex,
  deployer: Address,
  deployedAt: z.number().int(),
  compiler: z.object({ version: z.string(), settings: z.unknown().optional() }),
  libraries: Libraries.optional(),
  kind: z.enum(["standard", "proxy"]).default("standard"),
  implementation: Address.optional(),
});
// Explicit interface (not z.infer) for the type plugins and consumers import: a
// documented, stable, bundle-safe public boundary. The Zod schema above validates
// at runtime and its output is assignable to this.
export interface DeploymentRecord {
  readonly contractName: string;
  readonly deploymentName: string;
  readonly address: `0x${string}`;
  readonly chainId: number;
  readonly networkName: string;
  readonly abi: Abi;
  readonly bytecode: `0x${string}`;
  readonly constructorArgs: readonly unknown[];
  readonly transactionHash: `0x${string}`;
  readonly deployer: `0x${string}`;
  readonly deployedAt: number;
  readonly compiler: { readonly version: string; readonly settings?: unknown };
  readonly libraries?: Record<string, `0x${string}`>;
  readonly kind: "standard" | "proxy";
  readonly implementation?: `0x${string}`;
}
