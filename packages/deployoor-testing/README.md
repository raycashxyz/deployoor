# @deployoor/testing

> Test your deployoor deploys against a real in-memory EVM (via tevm) — no local node.

**Requires Node ≥ 20.** tevm's CJS build depends on ESM-only packages that break under `require()` on Node 18; the ESM import path works on Node 18, but CJS consumers need Node ≥ 20.19.

`createTestClients()` boots [tevm](https://tevm.sh) in-process and hands you ordinary viem wallet/public clients. Pass them straight to a generated deployer and your test deploys real contracts to a real EVM — no `hardhat node`, no anvil, no RPC. The tevm version is pinned by this package, so you never fight a version mismatch.

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

`createTestClients()` returns `{ account, accounts, chain, walletClient, publicClient, walletClientFor, tevm, cheatcodes, store }`. Spreading it into a deployer passes the **in-memory `store`**, so deploys never touch disk and vanish when the test ends — no stale `deployments/` files, no cross-run reuse. `account` is the first prefunded account (bound to `walletClient`).

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

### tevm options

Pass tevm's `createMemoryClient` options straight through — e.g. fork a live chain, or change mining:

```ts
import { http } from "viem";
const { publicClient } = await createTestClients({ fork: { transport: http(process.env.MAINNET_RPC) } });
```

Mining defaults to `"auto"`; override it in the same options object.

### EVM controls

For tests that need state control, use the underlying `tevm` client or the small `cheatcodes` wrapper:

```ts
const { accounts, publicClient, cheatcodes } = await createTestClients();
const [, alice] = accounts;

await cheatcodes.setBalance(alice.address, 10n ** 18n);
await cheatcodes.mine();
expect(await publicClient.getBalance({ address: alice.address })).toBe(10n ** 18n);
```

`cheatcodes` exposes `setBalance`, `deal`, `mine`, `setAccount`, `dumpState`, and `loadState`. Use `tevm` directly when you need lower-level tevm APIs.

### Fixtures

`createFixture` gives you a Hardhat-style fixture backed by `tevmDumpState` / `tevmLoadState`:

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

### Forks + committed records

Seed the in-memory store from committed deployment records to test against existing production/testnet addresses on a fork:

```ts
const clients = await createTestClients({
  fork: { transport: http(process.env.MAINNET_RPC) },
  deployments: "./deployments",
  deploymentNetwork: "1-ethereum",
});

const { contract: token } = await getOrDeployToken({ ...clients, args: [owner] }); // reuses the seeded record
```
