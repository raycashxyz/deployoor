---
"deployoor": minor
"@deployoor/testing": minor
---

Writes on a deployed contract no longer need an explicit `{ account, chain }`.

`DeployResult.contract` was typed against a bare `WalletClient`, whose `chain` and `account` are both `Chain | undefined` / `Account | undefined`. viem makes the second argument of a write mandatory whenever either could be `undefined`, so `contract.write.foo(args)` demanded `{ account, chain }` even though the deployer had already bound both. The contract type now names the shape the engine actually runs on (`clientsLayer` fails with `NoChainOnClient` without a chain and an account), so a single-argument write typechecks:

```ts
const { contract } = await getOrDeployCounter({ walletClient, publicClient, args: [1n, owner] });
await contract.write.increment(); // was: increment({ account, chain })
```

Passing the options explicitly still works, so existing scripts keep compiling.

`register` now resolves to a contract that matches the client it was handed. It broadcasts nothing, so it accepts clients a deploy would reject, and each gets the write surface it can actually use: a wallet client with an account and a chain writes with no second argument; one binding neither still has `write` but must pass `{ account, chain }`; a public client alone gets no `write` at all. Previously every case was typed writable-and-bound, so `register({ publicClient })` followed by `contract.write.foo(...)` typechecked and then threw.

`@deployoor/testing`'s clients are typed as bound (they always were, at runtime), so `contract.write.foo(args)` works single-argument in tests too. `TestWalletClient` is exported for annotating helpers.

New exported types on `deployoor`: `BoundWalletClient`, `DeployedContract`, `UnboundContract`, `ReadOnlyContract`, and `Register`. `DeployResult` takes an optional second type parameter for the contract type, defaulting to the writable one.
