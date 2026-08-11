import type { Abi, AbiParameter } from "viem";

/**
 * Canonical form of an abi, for answering "is this the same interface?".
 *
 * A committed `deployers/` carries the abi while the bytecode is read from disk, so the two can
 * drift: edit a contract, recompile, forget to regenerate, and the deploy would encode constructor
 * args against the old interface and write the old abi into the record — which is what
 * `@deployoor/wagmi` and every consumer then trusts. Comparing the two abis is what catches that.
 *
 * It has to be a *semantic* comparison. `JSON.stringify` equality trips on things that are not
 * interface changes at all — solc key order, abi entry order, and `internalType`, which changes when a
 * struct is renamed without altering the encoding. A check that fires spuriously gets ignored, so
 * those are all normalised away.
 *
 * viem's `formatAbiItem` is not reusable here: it throws on `constructor`, which is the one item that
 * matters most since it types `args`.
 */

/**
 * Tuples nest, so a parameter's type is built recursively; the array suffix rides on the outside.
 * Components recurse through `parameter`, not through this, so struct *field* names are part of the
 * canonical form for the same reason top-level parameter names are.
 */
const parameterType = (p: AbiParameter): string => {
  if (!p.type.startsWith("tuple")) return p.type;
  const components = "components" in p ? p.components : [];
  return `(${components.map(parameter).join(",")})${p.type.slice("tuple".length)}`;
};

/**
 * Parameter names are included deliberately. Renaming one cannot break a transaction, but the record's
 * abi feeds consumption codegen, so a stale name propagates into consumers' generated types. This is
 * the strictest edge of the check; dropping `name` here is the one-line relaxation.
 */
const parameter = (p: AbiParameter): string => {
  const indexed = "indexed" in p && p.indexed === true ? " indexed" : "";
  return `${parameterType(p)}${indexed}${p.name === undefined || p.name === "" ? "" : ` ${p.name}`}`;
};

/**
 * Covers the whole JSON-ABI surface: `function` (name, inputs, outputs, mutability), `constructor` and
 * `fallback`/`receive` (mutability), `error` (name, inputs), and `event` (name, indexed inputs, and
 * `anonymous`). An anonymous event carries no topic0 and is decoded differently, so flipping the flag
 * is an interface change even though the signature text is identical.
 */
const canonicalItem = (item: Abi[number]): string => {
  const inputs = "inputs" in item ? item.inputs : [];
  const outputs =
    "outputs" in item && item.outputs.length > 0 ? ` returns (${item.outputs.map(parameter).join(",")})` : "";
  const mutability = "stateMutability" in item ? ` ${item.stateMutability}` : "";
  const anonymous = item.type === "event" && item.anonymous === true ? " anonymous" : "";
  const name = "name" in item ? item.name : "";
  return `${item.type} ${name}(${inputs.map(parameter).join(",")})${mutability}${outputs}${anonymous}`;
};

/** Sorted so entry order never matters. */
export const canonicalAbi = (abi: Abi): readonly string[] => abi.map(canonicalItem).sort();

export interface AbiDifference {
  /** Present in `next` but not in `previous`. */
  readonly added: readonly string[];
  /** Present in `previous` but not in `next`. */
  readonly removed: readonly string[];
}

/** Empty `added` and `removed` means the two abis describe the same interface. */
export const diffAbi = (previous: Abi, next: Abi): AbiDifference => {
  const before = new Set(canonicalAbi(previous));
  const after = new Set(canonicalAbi(next));
  return {
    added: [...after].filter((entry) => !before.has(entry)),
    removed: [...before].filter((entry) => !after.has(entry)),
  };
};

export const abiMatches = (previous: Abi, next: Abi): boolean => {
  const { added, removed } = diffAbi(previous, next);
  return added.length === 0 && removed.length === 0;
};
