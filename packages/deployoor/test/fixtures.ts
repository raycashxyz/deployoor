import type { Abi } from "viem";
import type { TypedArtifact } from "../src/index";

/**
 * Real artifacts (compiled with solc 0.8.35) so they deploy on a real EVM (tevm).
 *   contract Counter  { uint256 public count; address public owner;
 *                       constructor(uint256 start, address owner_) {...} function increment() {...} }
 *   contract Reverter { constructor() { revert("boom"); } }   // exercises the failed-deploy path
 * The library artifact is synthetic — the missing-library path fails before any EVM call.
 */
export const COUNTER_ABI = [
  {
    inputs: [
      { name: "start", type: "uint256" },
      { name: "owner_", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "count",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "increment", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

export const COUNTER_BYTECODE =
  "0x6080604052348015600e575f5ffd5b50604051610190380380610190833981016040819052602b916053565b5f91909155600180546001600160a01b0319166001600160a01b03909216919091179055608b565b5f5f604083850312156063575f5ffd5b825160208401519092506001600160a01b03811681146080575f5ffd5b809150509250929050565b60f9806100975f395ff3fe6080604052348015600e575f5ffd5b5060043610603a575f3560e01c806306661abd14603e5780638da5cb5b146058578063d09de08a146081575b5f5ffd5b60455f5481565b6040519081526020015b60405180910390f35b600154606a906001600160a01b031681565b6040516001600160a01b039091168152602001604f565b60876089565b005b60015f5f82825460989190609f565b9091555050565b8082018082111560bd57634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122049266f280ff0d3acfee4dab3121366cb4129ffcad132eeaa343cba292c99165e64736f6c63430008230033" as const;

export const counterArtifact: TypedArtifact<typeof COUNTER_ABI> = {
  name: "Counter",
  abi: COUNTER_ABI,
  bytecode: COUNTER_BYTECODE,
  metadata: {
    fullyQualifiedName: "src/Counter.sol:Counter",
    compilerVersion: "0.8.35",
    standardJsonInput: {
      language: "Solidity",
      sources: { "src/Counter.sol": { content: "// Counter" } },
      settings: {},
    },
    libraryPlaceholders: {},
  },
};

export const reverterArtifact: TypedArtifact = {
  name: "Reverter",
  abi: [{ inputs: [], stateMutability: "nonpayable", type: "constructor" }] as Abi,
  bytecode:
    "0x6080604052348015600e575f5ffd5b5060405162461bcd60e51b8152600401603f90602080825260049082015263626f6f6d60e01b604082015260600190565b60405180910390fdfe",
  metadata: { ...counterArtifact.metadata, fullyQualifiedName: "src/Reverter.sol:Reverter" },
};

const PLACEHOLDER = "f2b8c1a0d3e4f5061728394a5b6c7d8e9f";

/** Synthetic artifact whose bytecode needs a library — exercises the link path. */
export const libArtifact: TypedArtifact = {
  name: "UsesLib",
  abi: [{ inputs: [], stateMutability: "nonpayable", type: "constructor" }] as Abi,
  bytecode: `0x6080__$${PLACEHOLDER}$__`,
  metadata: {
    ...counterArtifact.metadata,
    fullyQualifiedName: "src/UsesLib.sol:UsesLib",
    libraryPlaceholders: { MathLib: PLACEHOLDER },
  },
};
