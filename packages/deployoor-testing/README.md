# @deployoor/testing

> Test your deployoor deploys against a real in-memory EVM — no local node.

**Requires Node ≥ 22.**

`createTestClients()` boots [EDR](https://github.com/NomicFoundation/edr) in-process and hands you ordinary viem wallet/public clients. Pass them straight to a generated deployer and your test deploys real contracts to a real EVM — no `hardhat node`, no anvil, no RPC.

EDR is the Rust EVM that powers Hardhat 3, so a Hardhat 3 project already has it on disk and pays nothing extra.

```bash
pnpm add -D @deployoor/testing deployoor viem
```

```ts
import { createTestClients } from "@deployoor/testing";
import { getOrDeployToken } from "../deployers";

it("deploys the token", async () => {
  const clients = await createTestClients();
  // spread `clients` so the deploy uses the in-memory store — nothing hits disk
  // getOrDeploy resolves to { contract, freshDeploy, receipt, deployment } — the viem object is `contract`
  const { contract: token } = await getOrDeployToken({ ...clients, args: [owner] });
  // it's a live contract on an in-memory chain — read/write against it
  expect(token.address).toMatch(/^0x/);
});
```

`createTestClients()` returns `{ account, accounts, chain, walletClient, publicClient, walletClientFor, provider, cheatcodes, store }`. Spreading it into a deployer passes the **in-memory `store`**, so deploys never touch disk and vanish when the test ends — no stale `deployments/` files, no cross-run reuse. `account` is the first prefunded account (bound to `walletClient`).

### Multiple accounts

`accounts` holds every prefunded account, and `walletClientFor(account)` builds a wallet client bound to any of them on the same EVM — for testing several addresses interacting:

```ts
const { accounts, publicClient, store, walletClientFor } = await createTestClients();
const [owner, alice] = accounts;

const { contract: token } = await getOrDeployToken({
  walletClient: walletClientFor(owner),
  publicClient,
  store,
  args: [owner.address],
});
await token.write.transfer([alice.address, 100n]); // owner sends
// alice acts with her own signer:
await token.write.approve([spender, 50n], { account: alice });
```

### EVM options

```ts
const { publicClient } = await createTestClients({
  fork: { url: process.env.MAINNET_RPC, blockNumber: 21_000_000n },
  chainId: 31337,
  blockGasLimit: 30_000_000n,
  autoMine: true,
});
```

All optional. `autoMine` defaults to `true` (a block per transaction), `chainId` to `31337`. `fork.blockNumber` defaults to the latest safe block, and `fork.cacheDir` controls where remote RPC responses are cached between runs.

### EVM controls

For tests that need state control, use the small `cheatcodes` wrapper:

```ts
const { accounts, publicClient, cheatcodes } = await createTestClients();
const [, alice] = accounts;

await cheatcodes.setBalance(alice.address, 10n ** 18n);
await cheatcodes.mine();
expect(await publicClient.getBalance({ address: alice.address })).toBe(10n ** 18n);
```

`cheatcodes` exposes `setBalance`, `mine`, `setAccount`, `snapshot`, and `revert`.

For anything it doesn't cover, `provider` is the raw EIP-1193 handle — every `hardhat_*` and `evm_*` method the EVM supports is reachable through it:

```ts
const { provider } = await createTestClients();
await provider.request({ method: "hardhat_impersonateAccount", params: [whale] });
await provider.request({ method: "evm_setNextBlockTimestamp", params: ["0x100000000"] });
```

Note there is no ERC20 `deal`. Setting a token balance means guessing which storage slot holds the balance mapping, which breaks on proxies, packed slots and rebasing tokens. Mint from the token's owner, or transfer from a holder on a fork; if you really do need to forge a slot, `provider.request({ method: "hardhat_setStorageAt", ... })` is right there and you know your token's layout better than we do.

### Fixtures

`createFixture` gives you a Hardhat-style fixture backed by `snapshot` / `revert`:

```ts
import { createFixture, createTestClients } from "@deployoor/testing";

const useToken = createFixture(async (clients) => {
  const { contract: token } = await getOrDeployToken({ ...clients, args: [clients.account.address] });
  return { token };
});

const clients = await createTestClients();
const { token } = await useToken(clients); // first call deploys and snapshots
await useToken(clients); // later calls restore the snapshot
```

`revert` consumes its snapshot id, so `createFixture` takes a fresh snapshot after each restore. If you call `cheatcodes.snapshot()` yourself, restoring the same point twice needs two snapshots.

### Forks + committed records

Seed the in-memory store from committed deployment records to test against existing production/testnet addresses on a fork:

```ts
const clients = await createTestClients({
  fork: { url: process.env.MAINNET_RPC },
  deployments: "./deployments",
  deploymentNetwork: "1-ethereum",
});

const { contract: token } = await getOrDeployToken({ ...clients, args: [owner] }); // reuses the seeded record
```
