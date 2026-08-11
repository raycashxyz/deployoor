import { describe, it, expect } from "vitest";
import type { Abi } from "viem";
import { abiMatches, canonicalAbi, diffAbi } from "../../src/artifacts/abi-identity";

const base = [
  {
    type: "constructor",
    inputs: [{ name: "initial", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [{ name: "to", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Sent",
    inputs: [{ name: "from", type: "address", indexed: true, internalType: "address" }],
  },
  {
    type: "function",
    name: "cfg",
    inputs: [
      {
        name: "c",
        type: "tuple",
        internalType: "struct S",
        components: [{ name: "x", type: "uint256", internalType: "uint256" }],
      },
    ],
    outputs: [],
    stateMutability: "view",
  },
] as const satisfies Abi;

/** The same interface as `base`, but with every kind of formatting noise solc can vary. */
const noisy = [
  {
    type: "event",
    name: "Sent",
    inputs: [{ indexed: true, internalType: "contract IThing", name: "from", type: "address" }],
  },
  {
    type: "function",
    name: "cfg",
    inputs: [
      {
        type: "tuple",
        name: "c",
        internalType: "struct Renamed",
        components: [{ type: "uint256", name: "x", internalType: "uint256" }],
      },
    ],
    outputs: [],
    stateMutability: "view",
  },
  {
    stateMutability: "nonpayable",
    outputs: [{ internalType: "bool", type: "bool", name: "" }],
    name: "transfer",
    inputs: [{ internalType: "contract IThing", type: "address", name: "to" }],
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "initial", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
] as const satisfies Abi;

/** Replace the one item matching `name`, leaving the rest of `base` alone. */
const replacing = (name: string, item: Abi[number]): Abi =>
  base.map((entry) => ("name" in entry && entry.name === name ? item : entry));

describe("canonicalAbi", () => {
  it("ignores entry order, key order, and internalType", () => {
    expect(canonicalAbi(base)).toEqual(canonicalAbi(noisy));
    expect(abiMatches(base, noisy)).toBe(true);
    // Guard the premise: these really are different documents.
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(noisy));
  });

  it("includes the constructor, which viem's formatAbiItem refuses to format", () => {
    expect(canonicalAbi(base).some((entry) => entry.startsWith("constructor"))).toBe(true);
  });

  it("expands tuple components rather than emitting the word tuple", () => {
    expect(canonicalAbi(base).find((entry) => entry.includes("cfg"))).toContain("(uint256 x)");
  });
});

describe("diffAbi", () => {
  it("reports an added function, and names it readably", () => {
    const next: Abi = [
      ...base,
      { type: "function", name: "decrement", inputs: [], outputs: [], stateMutability: "nonpayable" },
    ];
    expect(diffAbi(base, next)).toEqual({
      added: ["function decrement() nonpayable"],
      removed: [],
    });
  });

  it("reports a removed function", () => {
    const next = base.filter((entry) => !("name" in entry && entry.name === "transfer"));
    expect(diffAbi(base, next).removed).toEqual(["function transfer(address to) nonpayable returns (bool)"]);
    expect(diffAbi(base, next).added).toEqual([]);
  });

  it("detects a constructor gaining an argument", () => {
    const next: Abi = base.map((entry) =>
      entry.type === "constructor"
        ? { ...entry, inputs: [...entry.inputs, { name: "owner", type: "address" }] }
        : entry,
    );
    expect(abiMatches(base, next)).toBe(false);
  });

  it("detects a mutability change", () => {
    expect(abiMatches(base, replacing("cfg", { ...base[3], stateMutability: "nonpayable" }))).toBe(false);
  });

  it("detects a changed tuple field type", () => {
    expect(
      abiMatches(
        base,
        replacing("cfg", {
          ...base[3],
          inputs: [{ name: "c", type: "tuple", components: [{ name: "x", type: "uint128" }] }],
        }),
      ),
    ).toBe(false);
  });

  it("detects a renamed parameter, the deliberate strict edge", () => {
    // Encoding-neutral, but the record's abi feeds consumption codegen, so the name matters.
    expect(
      abiMatches(
        base,
        replacing("transfer", { ...base[1], inputs: [{ name: "recipient", type: "address" }] }),
      ),
    ).toBe(false);
  });

  it("detects an event parameter losing indexed", () => {
    expect(
      abiMatches(
        base,
        replacing("Sent", { ...base[2], inputs: [{ name: "from", type: "address", indexed: false }] }),
      ),
    ).toBe(false);
  });
});
