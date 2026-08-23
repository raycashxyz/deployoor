---
"deployoor": minor
---

Writes on a deployed contract no longer need an explicit `{ account, chain }`.

`DeployResult.contract` was typed against a bare `WalletClient`, whose `chain` and `account` are both `Chain | undefined` / `Account | undefined`. viem makes the second argument of a write mandatory whenever either could be `undefined`, so `contract.write.foo(args)` demanded `{ account, chain }` even though the deployer had already bound both. The contract type now names the shape the engine actually runs on (`clientsLayer` fails with `NoChainOnClient` without a chain and an account), so a single-argument write typechecks:

```ts
const { contract } = await getOrDeployCounter({ walletClient, publicClient, args: [1n, owner] });
await contract.write.increment(); // was: increment({ account, chain })
```

Passing the options explicitly still works, so existing scripts keep compiling.

`register` called with only a `publicClient` now resolves to a read-only contract (`ReadOnlyContract`, the same type without `write`). viem builds no `write` namespace for a public client alone, so `contract.write.foo(...)` on that result used to typecheck and then throw. Pass a `walletClient` to get a writable contract back.

`DeployedContract` and `ReadOnlyContract` are exported for annotating helpers, and `DeployResult` takes an optional second type parameter for the contract type (defaulting to the writable one).
