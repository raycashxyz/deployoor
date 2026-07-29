import { isAddressEqual } from "viem";
import type { Abi } from "viem";
import { codeHash } from "./identity";
import type { DeploymentRecord, IdentityChange, Libraries, RedeployReason } from "../schemas";

/**
 * Component diff between a recorded deployment and the current artifact + args + libraries. It
 * drives both the redeploy decision (an empty diff ⟺ the same deploy identity) and the human
 * reason. It never ABI-encodes the record's JSON args — so it can't throw and isn't fooled by
 * bigint/checksum drift — and for a v1 record (no `deployedBytecode`) it falls back to a strict
 * creation-bytecode comparison.
 */

// Normalize one constructor arg to a stable key, matching how the store serializes values
// (bigint → string, addresses lowercased), so representation drift is never flagged as a change.
const argKey = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) => {
    if (typeof inner === "bigint") return inner.toString();
    if (typeof inner === "string" && /^0x[0-9a-fA-F]{40}$/.test(inner)) return inner.toLowerCase();
    return inner;
  }) ?? "undefined";

const constructorInputs = (abi: Abi): readonly { readonly name?: string }[] => {
  const ctor = abi.find(
    (item): item is Extract<Abi[number], { type: "constructor" }> => item.type === "constructor",
  );
  return ctor?.inputs ?? [];
};

export const diffIdentity = (input: {
  readonly existing: DeploymentRecord;
  readonly bytecode: `0x${string}`;
  readonly deployedBytecode: `0x${string}`;
  readonly args: readonly unknown[];
  readonly libraries: Libraries;
}): IdentityChange[] => {
  const codeChanged =
    input.existing.deployedBytecode !== undefined
      ? codeHash(input.existing.deployedBytecode) !== codeHash(input.deployedBytecode)
      : input.existing.bytecode !== input.bytecode;

  const existingLibraries = input.existing.libraries ?? {};
  const names = [...new Set([...Object.keys(existingLibraries), ...Object.keys(input.libraries)])].sort();
  const libraryChanges = names.flatMap((name): IdentityChange[] => {
    const from = existingLibraries[name];
    const to = input.libraries[name];
    const changed = from === undefined || to === undefined || !isAddressEqual(from, to);
    return changed ? [{ field: "library", name, from: from ?? "0x", to: to ?? "0x" }] : [];
  });

  const from = input.existing.constructorArgs;
  const to = input.args;
  const changedIndices = Array.from({ length: Math.max(from.length, to.length) }, (_v, i) => i).filter(
    (i) => argKey(from[i]) !== argKey(to[i]),
  );

  return [
    ...(codeChanged ? [{ field: "code" } as const] : []),
    ...libraryChanges,
    ...(changedIndices.length > 0
      ? [{ field: "args", from: [...from], to: [...to], changedIndices } as const]
      : []),
  ];
};

// Render one value: bigints and hex (addresses) bare, everything else JSON — full, never truncated.
const renderValue = (value: unknown): string => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) return value;
  return JSON.stringify(value);
};

const renderChange = (change: IdentityChange, abi: Abi): string => {
  if (change.field === "code") return "contract bytecode changed";
  if (change.field === "library") {
    return `library \`${change.name}\` changed from ${change.from} to ${change.to}`;
  }
  const inputs = constructorInputs(abi);
  const named = change.changedIndices
    .map((i) => (inputs[i]?.name !== undefined ? `arg ${i + 1} \`${inputs[i]?.name}\`` : `arg ${i + 1}`))
    .join(", ");
  const from = `[${change.from.map(renderValue).join(", ")}]`;
  const to = `[${change.to.map(renderValue).join(", ")}]`;
  return `constructor args changed from ${from} to ${to} (${named})`;
};

/** A human-readable reason for a history entry / console line — full values, whole addresses. */
export const renderSummary = (reason: RedeployReason, abi: Abi): string => {
  if (reason.kind === "fresh") return "first deployment";
  if (reason.kind === "forced") return "forced redeploy (strategy: always)";
  if (reason.kind === "registered") return "registered external contract";
  return reason.changes.length === 0
    ? "deploy identity changed"
    : reason.changes.map((change) => renderChange(change, abi)).join("; ");
};
