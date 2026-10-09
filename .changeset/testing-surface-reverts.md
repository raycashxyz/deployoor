---
"@deployoor/testing": patch
---

Reverts now behave as on a real node, so viem decodes custom errors.

- A reverting `eth_call` / `eth_estimateGas` throws. Before, the in-memory EVM returned the revert data as a successful result, so a reverting `readContract` or `simulateContract` resolved instead of throwing.
- The thrown error keeps the revert data, shaped as geth shapes it (`{ code: 3, data: "0x…" }`). Before, only the message survived, so viem reported "An unknown RPC error occurred" and a `ContractFunctionRevertedError` never carried the custom error's name or arguments.

A reverting transaction you send is still mined with a reverted receipt.
