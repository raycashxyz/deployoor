import { encodeAbiParameters, isAddressEqual } from "viem";
import type { Abi, AbiParameter, Hex } from "viem";
import { codeHash, stripMetadata } from "./identity";
import type { DeploymentRecord, IdentityChange, Libraries, RedeployReason } from "../schemas";

/**
 * Component diff between a recorded deployment and the current artifact + args + libraries. It
 * drives both the redeploy decision (an empty diff ⟺ the same deploy identity) and the human
 * reason. Every comparison is canonical — metadata-stripped bytecode, ABI-encoded args,
 * checksum-insensitive addresses — so representation drift is never mistaken for a change, and
 * every partial operation has a fallback, so it never throws.
 */

// Fallback key for a value the abi cannot encode: normalize the way the store serializes
// (bigint → string, addresses lowercased) so JSON round-tripping alone is not a change.
const jsonKey = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) => {
    if (typeof inner === "bigint") return inner.toString();
    if (typeof inner === "string" && /^0x[0-9a-fA-F]{40}$/.test(inner)) return inner.toLowerCase();
    return inner;
  }) ?? "undefined";

/**
 * Canonical key for one constructor arg: its ABI encoding against the declared input type, so
 * values the EVM cannot tell apart — `1`, `1n`, `"1"`, an address in either casing — share a key.
 * This is the canonicalisation `identityHash` applies to the whole tuple, so the diff and the hash
 * agree by construction. Anything unencodable (arity drift, a junk value, no constructor in the
 * abi) falls back to the JSON key rather than throwing.
 */
const argKey = (value: unknown, input: AbiParameter | undefined): string => {
  if (input === undefined) return jsonKey(value);
  try {
    return encodeAbiParameters([input], [value]);
  } catch {
    return jsonKey(value);
  }
};

const constructorInputs = (abi: Abi): readonly AbiParameter[] => {
  const ctor = abi.find(
    (item): item is Extract<Abi[number], { type: "constructor" }> => item.type === "constructor",
  );
  return ctor?.inputs ?? [];
};

export const diffIdentity = (input: {
  readonly existing: DeploymentRecord;
  readonly abi: Abi;
  readonly bytecode: Hex;
  readonly deployedBytecode: Hex;
  readonly args: readonly unknown[];
  readonly libraries: Libraries;
}): IdentityChange[] => {
  // Prefer the recorded `codeHash` (v2). Both sides can be absent — a v1 record, or bytecode
  // still carrying unlinked library placeholders — so fall back to comparing the creation
  // bytecode, metadata-stripped on both sides because solc's trailing CBOR hash moves on a
  // comment-only recompile and creation bytecode carries that trailer just as runtime code does.
  const currentCodeHash = codeHash(input.deployedBytecode);
  const codeChanged =
    input.existing.codeHash !== undefined && currentCodeHash !== undefined
      ? input.existing.codeHash !== currentCodeHash
      : stripMetadata(input.existing.bytecode) !== stripMetadata(input.bytecode);

  const existingLibraries = input.existing.libraries ?? {};
  const names = [...new Set([...Object.keys(existingLibraries), ...Object.keys(input.libraries)])].sort();
  const libraryChanges = names.flatMap((name): IdentityChange[] => {
    const from = existingLibraries[name];
    const to = input.libraries[name];
    const changed = from === undefined || to === undefined || !isAddressEqual(from, to);
    // Omit the absent side (added → no `from`, removed → no `to`) so the persisted history
    // stays a valid Address and re-parses; "0x" would fail Address validation on the next read.
    return changed ? [{ field: "library", name, from, to }] : [];
  });

  const inputs = constructorInputs(input.abi);
  const from = input.existing.constructorArgs;
  const to = input.args;
  const changedIndices = Array.from({ length: Math.max(from.length, to.length) }, (_v, i) => i).filter(
    (i) => argKey(from[i], inputs[i]) !== argKey(to[i], inputs[i]),
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
    if (change.from === undefined) return `library \`${change.name}\` added at ${change.to}`;
    if (change.to === undefined) return `library \`${change.name}\` removed (was ${change.from})`;
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
