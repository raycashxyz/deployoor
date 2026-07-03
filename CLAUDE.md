# CLAUDE.md

Guidance for AI agents (and humans) working in the **deployoor** monorepo.

## What deployoor is

`deployoor` (the crypto-degen `-oor` agent-noun of "deploy" — like buidloor/hodloor — literally "the thing that deploys"; the project was prototyped under the name `cudo`, Latin _cūdō_ "to forge/mint") is a **viem-first contract deployment** dev tool — like `@wagmi/cli` or Prisma. You run it to deploy once, keep a plain JSON record of which contract is deployed on which chain, then use those contracts as fully-typed objects with no copied addresses, stale ABIs, or provider wiring.

**Two parts, with a plain `deployments/` folder as the stable contract between them:**

```
artifacts (Hardhat artifacts/ or Foundry out/)
        │  Part 1 — `deployoor generate` + your deploy script
        ▼
deployments/<chainId>-<network>/<Contract>.json   ← source of truth: address, abi, chainId, args, tx, compiler
        │  Part 2 — @wagmi/cli + @deployoor/wagmi
        ▼
typed viem access / React hooks          ← you add a client; address + abi are already injected
```

deployoor owns Part 1 (deploy + the `deployments/` record + lifecycle hooks). Part 2 **delegates to `@wagmi/cli`** — we don't reinvent consumption codegen, we feed it.

North star: "contracts as plain TypeScript objects." On the deploy side, `getOrDeployToken(...)` resolves to `{ contract, freshDeploy, receipt, deployment }` — the typed viem object is `result.contract` (`contract.read.*` / `contract.write.*`).

## Layout

```
packages/
  deployoor/            — the engine: codegen + CLI (`deployoor generate` / `deployoor init`) + the deploy pipeline. Exports `deployoor` (main), `deployoor/plugin` (the plugin SDK subpath), and `deployoor/generate` (the programmatic `generateDeployers`, used by `@deployoor/hardhat`).
  deployoor-wagmi/      — @deployoor/wagmi: a @wagmi/cli plugin sourcing contracts from deployments/
  deployoor-hardhat/    — @deployoor/hardhat: a Hardhat plugin that runs `generateDeployers` after each `hardhat compile` (NOT a deploy-lifecycle plugin — a Hardhat-native task hook; peer-deps `hardhat` + `deployoor`, imports `deployoor/generate`)
  deployoor-etherscan/  — @deployoor/etherscan: Etherscan V2 verifier (one key, all chains; also Blockscout/Routescan via apiUrl)
  deployoor-sourcify/   — @deployoor/sourcify: Sourcify v2 verifier (keyless)
  deployoor-slack/      — @deployoor/slack: Slack notifier
  deployoor-testing/    — @deployoor/testing: createTestClients() (tevm as viem clients + an in-memory store) for node-free tests
apps/              — (placeholder) docs/marketing site goes here (vocs is the planned choice)
examples/          — dogfood projects (hardhat, foundry); verified via each one's `e2e` script (needs the toolchain), kept out of the core CI sweep
```

The **store is a pluggable `StoreAdapter`** (`src/store.ts`): `fsStore` (default, JSON on disk) and `memoryStore` are exported from `deployoor`, and a deployer accepts a `store` override in its call options — `@deployoor/testing` passes an in-memory store so test deploys never touch disk.

Plugins are **deploy-lifecycle hooks** authored against `deployoor/plugin`; each is its own npm package, peer-depends on `deployoor`, and imports **only** from `deployoor/plugin`.

## Commands

```bash
pnpm install
pnpm build       # turbo run build (tsdown, dual ESM+CJS)
pnpm test        # turbo run test (vitest)
pnpm typecheck   # turbo run typecheck (tsc --noEmit per package)
pnpm lint        # oxlint
pnpm format      # prettier --write .   (format:check in CI)
```

Turbo orders `^build` before each task, so the `deployoor` core builds before plugin tests/typechecks (plugins resolve `deployoor/plugin` from deployoor's **dist**). Per-package: `pnpm --filter @deployoor/etherscan test`.

## Architecture & key decisions (read before changing things)

- **Effect is fully internal.** The engine uses Effect (`Context.Tag` services, `Layer` DI, `Data.TaggedError`, `Effect.gen` pipelines). The **public API is Promise-only** — no `.effect` namespace. The single Effect→Promise crossing is in `createDeployer` (`Effect.runPromiseExit` + `Cause.squash`, so it rejects with the clean tagged error, not a FiberFailure).
- **The user never calls `createDeployer`.** `deployoor generate` emits one `export const getOrDeploy<Name> = defineDeployer(<name>Artifact, config)` per contract; the user imports it and calls `await getOrDeployToken({ walletClient, publicClient, args })`. The store + plugins are internal, derived from the project's `deployoor.config.ts`.
- **`getOrDeploy` is idempotent by design:** first call deploys + records; later calls return the existing deployment with no tx; `force: true` redeploys; `register({ deploymentName, address, abi })` records an external contract (e.g. USDC) with no tx. Both resolve to a `DeployResult` — `{ contract, deployment, freshDeploy, receipt? }` — where `freshDeploy` is `true` only when the call broadcast a deploy tx (so `register` and reuse are `false`) and `receipt` is present only then. `reset` returns `void`.
- **Zod 4** (pinned). **Do NOT use `abitype/zod` for schemas** — abitype 1.2.x's zod types are written against zod 3 (`Address` is `z.ZodEffects<...>`, removed in zod 4), so `z.infer` over them collapses to `any` under zod 4 (runtime validation works; only the types break — this was verified). Instead, `Address`/`Abi`/`Hex` are small **local `z.custom`** validators in `src/schemas.ts` that infer precisely. abitype's `Abi` _type_ (via viem) is still the source of truth for the abi shape.
- **Boundary types are explicit interfaces, not `z.infer`** (`DeploymentRecord`, `Libraries`, `TypedArtifact`). The Zod schemas validate at runtime; the exported _types_ are hand-written so they're documented, stable, and survive `.d.ts` bundling. Keep schema and interface in sync.
- **Deployment records are vanilla JSON** (a one-line bigint→string replacer in `fsStore`, no superjson) — they're committed to the user's repo and read by humans, Part 2, and other tools, so they must be flat/portable.
- **Real-EVM tests via tevm** (`test/evm-clients.ts`'s `makeEvmClients()` → tevm `createMemoryClient` exposed as viem clients over `custom(memory, { retryCount: 0 })`). No fake clients. `makeEvmClients` has an **explicit viem return-type annotation** — don't remove it (the inferred tevm chain type pulls in `@ethereumjs/common`, which isn't nameable under `declaration: true` → TS2742).
- **Codegen is proven by a tsc-over-emitted spine** (`packages/deployoor/test/codegen/emitted-typecheck.test.ts`): builds dist, generates into a temp project, runs `tsc` over the emitted deployers, asserts zero diagnostics.

## Build/CI gotchas (already fixed — don't regress)

- **`unrun` is an explicit devDep of every package.** tsdown's config loader (`unrun`) is declared an _optional peer_, so pnpm skips it and a clean `--frozen-lockfile` build fails with "Failed to import module unrun". Keep it pinned in each package's devDependencies.
- **Building requires Node 20+** (rolldown — tsdown's engine — uses `node:util.styleText`). CI builds on Node **20/22/24**. The published dist targets node18, so `engines: ">=18"` (runtime) is correct; only the dev toolchain needs 20+.

## Conventions (match the existing code)

- **Functional / declarative.** No `for` loops — use `.map` / `.reduce` / `.flatMap` / `Array.from` / `Effect.forEach`. Helpers return values; no side-effects in setup; prefer `const`, no shared mutable state.
- **Arrow functions + curried DI.** `const foo = () => {}`; single param without parens; dependencies via destructured named params with production defaults; definitions precede use.
- **No `as any`.** `!` (non-null) and unnecessary `?` are code smells — fix the root cause: narrow with guards (`if (x === undefined) throw …`), `as const`, or restructure so nullability is impossible.
- **Errors in Effect's channel** (tagged errors). No nested try/catch; no complex ternaries (prefer `Match` / `Option` / `pipe`).
- **Tests (Vitest):** third-person `it("does X when Y")` (no "should", no test-case IDs); assert specific errors; for state changes, assert the precondition before and the postcondition after; use `vi.fn()` spies; real-EVM via tevm. Plugin tests inject a mock `fetch` via `PluginDeps`.
- Always run `tsc --noEmit` (+ root `oxlint`/`prettier`) on **every** package you touch; fix all diagnostics, not just the ones that seem important. Break calls with >3 args across multiple lines. Use mermaid (never ASCII art) in docs.
- **Commits:** Conventional Commits, grouped into logical units (no mega-commits). **No AI co-author / "generated with" attribution lines. No "test plan" sections in PRs** — verify before opening, not after.

## Releasing (Changesets)

Every PR that changes a publishable package must include a changeset (`pnpm changeset` → pick packages + bump + summary). CI enforces this: the `changeset` job in `ci.yml` runs `changeset status --since=origin/<base>` and fails a PR that lacks one (use `pnpm changeset --empty` for no-release changes). Changelogs are generated per package by Changesets' default generator (network-free; we deliberately avoid `@changesets/changelog-github` because its per-release GitHub GraphQL call failed reliably in CI with "Premature close").

Release flow (`release.yml`, on push to `main`): the `changesets/action` opens/updates a "Version Packages" PR that bumps versions + writes `CHANGELOG.md`; merging it runs `pnpm release` (`turbo build && changeset publish`) and publishes to npm. Auth is **tokenless OIDC trusted publishing** — each package has a trusted publisher (`raycashxyz/deployoor`, `release.yml`) configured on npm, so the workflow runs with no `NPM_TOKEN`: `id-token: write` + `npm install -g npm@latest` (OIDC needs npm ≥ 11.5.1), and provenance is generated automatically. Published 0.1.0 first via a token, then switched to OIDC (npm can't bootstrap a brand-new package over OIDC).

The `@deployoor` npm org is **claimed**; all packages are `private: false`. Versioning is independent per package (`fixed`/`linked` empty); internal deps bump via `updateInternalDependencies: patch`. Pre-1.0, treat minor bumps as potentially breaking.

## Status & next steps

Early. Deploy core + plugin model + wagmi bridge are stabilizing. Foundry and Hardhat v2 work today; Hardhat v3 support is a priority compatibility item.

- Docs site in `apps/` (vocs — the framework behind viem.sh/wagmi.sh — is the planned choice).
- More plugins as needed: lift Tenderly → `@deployoor/tenderly`; a gas/cost report; an `.env`/address-book writer (would exercise the `onGenerated` hook once wired).
- A `createContracts({ client })` runtime helper was **deliberately rejected** — it would kill tree-shaking. The tree-shakeable path to viem-object ergonomics is per-contract generated factories, but `@wagmi/cli`'s per-export output already covers typed access.

Repo: https://github.com/raycashxyz/deployoor · the full dev history lives on branch `audit-hardhat-viem-deploy` of the `fellow-monorepo` repo (where it was prototyped before extraction).
