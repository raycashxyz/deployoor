# Custom paths

Every path in this project is moved off its default, to show which of them deployoor works out for
itself and which you have to tell it.

```text
src/contracts/Counter.sol     ← Hardhat `paths.sources`
build/artifacts/              ← Hardhat `paths.artifacts` (gitignored: build output)
generated/deployers/          ← deployoor `out`        (committed)
records/                      ← deployoor `deploymentsPath` (committed)
```

## The split

**Paths your framework owns, deployoor reads.** `hardhat.config.js` already says artifacts go to
`build/artifacts`, so `deployoor.config.ts` does not mention it:

```js
// hardhat.config.js
module.exports = {
  solidity: "0.8.24",
  paths: { sources: "src/contracts", artifacts: "build/artifacts", cache: "build/cache" },
};
```

Repeating that in a deployoor config would create a second copy of a setting that already has an
owner, free to drift from it. Foundry works the same way through `out` in `foundry.toml`.

**Paths deployoor owns, you set.** Nothing else knows where the deployers and the records go:

```ts
// deployoor.config.ts
export default defineConfig({
  out: "./generated/deployers",
  deploymentsPath: "./records",
});
```

That is the whole config. The other five examples in this repo have **no config file at all**,
because their paths are the defaults — see [configuration](https://deployoor.dev/guides/configuration).

## Run it

```bash
pnpm i
pnpm e2e   # hardhat compile → generate into generated/deployers → deploy on an in-memory EVM
```

`hardhat compile` also regenerates the deployers, because
[`@deployoor/hardhat`](https://deployoor.dev/guides/hardhat) hooks the compile task.

## The bug this example found

deployoor reads `paths.artifacts` by importing `hardhat.config.js`. This config registers a plugin —
`require("@deployoor/hardhat")` — and a config that registers anything cannot be imported outside a
Hardhat run: it throws `HH5: HardhatContext is not created`.

That used to mean deployoor fell back to the default `./artifacts`, so this example's tests failed
with "No compiled artifacts" even though `generate` had just succeeded — `generate` works because the
Hardhat plugin hands the path over directly, while a deploy or a test has to read the config itself.

Since it is the normal shape of a Hardhat project rather than an edge case, deployoor now falls back
to reading `paths.artifacts` out of the config as text when it cannot evaluate it. A computed path
(`join(__dirname, …)`) still needs `artifactsPath` set explicitly.
