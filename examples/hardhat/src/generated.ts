import { createReadContract, createWriteContract, createSimulateContract } from "@wagmi/core/codegen";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Counter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 *
 */
export const counterAbi = [
  {
    type: "constructor",
    inputs: [{ name: "initial", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  { type: "function", inputs: [], name: "increment", outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    inputs: [],
    name: "number",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "n", internalType: "uint256", type: "uint256" }],
    name: "setNumber",
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/**
 *
 */
export const counterAddress = {
  31337: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
} as const;

/**
 *
 */
export const counterConfig = { address: counterAddress, abi: counterAbi } as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link counterAbi}__
 *
 *
 */
export const readCounter = /*#__PURE__*/ createReadContract({ abi: counterAbi, address: counterAddress });

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link counterAbi}__ and `functionName` set to `"number"`
 *
 *
 */
export const readCounterNumber = /*#__PURE__*/ createReadContract({
  abi: counterAbi,
  address: counterAddress,
  functionName: "number",
});

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link counterAbi}__
 *
 *
 */
export const writeCounter = /*#__PURE__*/ createWriteContract({ abi: counterAbi, address: counterAddress });

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link counterAbi}__ and `functionName` set to `"increment"`
 *
 *
 */
export const writeCounterIncrement = /*#__PURE__*/ createWriteContract({
  abi: counterAbi,
  address: counterAddress,
  functionName: "increment",
});

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link counterAbi}__ and `functionName` set to `"setNumber"`
 *
 *
 */
export const writeCounterSetNumber = /*#__PURE__*/ createWriteContract({
  abi: counterAbi,
  address: counterAddress,
  functionName: "setNumber",
});

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link counterAbi}__
 *
 *
 */
export const simulateCounter = /*#__PURE__*/ createSimulateContract({
  abi: counterAbi,
  address: counterAddress,
});

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link counterAbi}__ and `functionName` set to `"increment"`
 *
 *
 */
export const simulateCounterIncrement = /*#__PURE__*/ createSimulateContract({
  abi: counterAbi,
  address: counterAddress,
  functionName: "increment",
});

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link counterAbi}__ and `functionName` set to `"setNumber"`
 *
 *
 */
export const simulateCounterSetNumber = /*#__PURE__*/ createSimulateContract({
  abi: counterAbi,
  address: counterAddress,
  functionName: "setNumber",
});
