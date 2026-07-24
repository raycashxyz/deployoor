# Contributing to deployoor

Thanks for being here. deployoor is early, which means small contributions move it a lot — a failing-case bug report, a docs fix, or a new plugin all land quickly.

Not sure where to start? Open a [Discussion](https://github.com/raycashxyz/deployoor/discussions) or drop into [Telegram](https://t.me/deployoor). For bugs and concrete feature requests, use the [issue templates](https://github.com/raycashxyz/deployoor/issues/new/choose).

## The fast path to a green PR

```bash
git clone https://github.com/raycashxyz/deployoor.git
cd deployoor
pnpm install

pnpm build        # tsdown, dual ESM+CJS — run this first
pnpm typecheck
pnpm test
pnpm lint && pnpm format:check
pnpm changeset    # required if you touched a publishable package (see below)
```

That's the whole loop — CI runs the same `typecheck`, `test`, `lint`, and `format:check`, plus a changeset gate. If it passes locally, your PR is green.

**Node 20+ is required to build.** tsdown's engine (rolldown) uses `node:util.styleText`. The published output targets Node 18, so consumers on 18 are fine — only the dev toolchain needs 20+. CI builds on 20, 22, and 24. The docs site needs Node 22+ (Vocs 2.x uses `node:fs/promises` glob).

**Always `pnpm build` before `pnpm test`.** Plugin packages import `deployoor/plugin`, which resolves through package exports to `deployoor`'s `dist/`. Turbo orders `^build` before each task, so `pnpm test` from the root handles this for you — but a bare `pnpm --filter @deployoor/etherscan test` on a clean checkout will fail until the core is built.

## Repo layout

```
packages/
  deployoor/            the engine: codegen + CLI + deploy pipeline
  deployoor-wagmi/      @wagmi/cli plugin sourcing contracts from deployments/
  deployoor-hardhat/    Hardhat plugin: auto-generate after `hardhat compile`
  deployoor-etherscan/  Etherscan V2 verifier
  deployoor-sourcify/   Sourcify v2 verifier (keyless)
  deployoor-slack/      Slack notifier
  deployoor-testing/    createTestClients() — tevm as viem clients
apps/docs/              Vocs v2 site for deployoor.dev
examples/               dogfood projects (hardhat, hardhat-v3, foundry, tevm, multi-chain)
```

Per-package work: `pnpm --filter @deployoor/etherscan test`.

Examples are verified by each one's own `e2e` script (they need the real toolchain — Hardhat, Foundry) and are deliberately kept out of the core CI sweep. If you change something that affects an example, run it:

```bash
pnpm --filter @example/hardhat e2e
```

## Changesets are required

Every PR that changes a publishable package must include a changeset. CI enforces this — the `changeset` job runs `changeset status --since=origin/<base>` and fails a PR without one.

```bash
pnpm changeset          # pick packages, pick the bump, write a summary
pnpm changeset --empty  # for changes that need no release (docs, CI, examples, tests)
```

The summary becomes the changelog entry users read, so write it for them: what changed and what they should do about it, not which files you edited.

Pre-1.0, treat minor bumps as potentially breaking. Versioning is independent per package.

You don't publish anything — merging to `main` opens a "Version Packages" PR, and merging _that_ publishes to npm via OIDC trusted publishing.

## Conventions

The codebase is consistent on purpose. Match the code around you; these are the rules that surprise people:

**Functional and declarative.** No `for` loops — use `.map` / `.reduce` / `.flatMap` / `Array.from` / `Effect.forEach`. Prefer `const`, no shared mutable state, no side effects in setup. Arrow functions, dependencies injected as destructured named params with production defaults.

**No `as any`.** `!` (non-null assertion) and an unnecessary `?` are code smells — fix the root cause instead: narrow with a guard (`if (x === undefined) throw …`), use `as const`, or restructure so the nullability can't happen.

**Effect is fully internal.** The engine uses Effect (`Context.Tag` services, `Layer` DI, `Data.TaggedError`, `Effect.gen`), but the **public API is Promise-only** — there is no `.effect` namespace. The single Effect→Promise crossing lives in `createDeployer`. Errors belong in Effect's error channel as tagged errors; no nested try/catch, and prefer `Match` / `Option` / `pipe` over layered ternaries.

**Zod 4, with local validators.** Don't reach for `abitype/zod` — abitype's zod types are written against zod 3, so `z.infer` over them collapses to `any` under zod 4. `Address` / `Abi` / `Hex` are small local `z.custom` validators in `src/schemas.ts`.

**Boundary types are hand-written interfaces, not `z.infer`.** `DeploymentRecord`, `Libraries`, and `TypedArtifact` are explicit so they're documented, stable, and survive `.d.ts` bundling. If you change a schema, update its interface to match.

**Deployment records are vanilla JSON.** They get committed to a user's repo and read by humans and other tools, so they stay flat and portable — a one-line bigint→string replacer, no superjson.

Run `tsc --noEmit`, `oxlint`, and `prettier` on **every** package you touch, and fix all diagnostics — not just the ones that look important. Break calls with more than three arguments across multiple lines. Use mermaid for diagrams, never ASCII art.

## Tests

Vitest, with real EVM execution — no fake clients. `test/evm-clients.ts`'s `makeEvmClients()` exposes a tevm `createMemoryClient` as viem clients.

- Third-person `it("does X when Y")` — no "should", no test-case IDs.
- Assert specific errors, not just that something threw.
- For state changes, assert the precondition **before** and the postcondition **after**.
- `vi.fn()` for spies. Plugin tests inject a mock `fetch` through `PluginDeps`.

Don't remove the explicit viem return-type annotation on `makeEvmClients` — the inferred tevm chain type pulls in `@ethereumjs/common`, which isn't nameable under `declaration: true` (TS2742).

Codegen is covered by a tsc-over-emitted-output test (`packages/deployoor/test/codegen/emitted-typecheck.test.ts`): it builds `dist`, generates into a temp project, runs `tsc` over the emitted deployers, and asserts zero diagnostics. If you change codegen, that test is your ground truth.

## Writing a plugin

This is the most self-contained way to contribute, and the roadmap has open slots (Discord, Tenderly, gas/cost reports, IPFS source pinning, Safe proposals).

A plugin is a named object of deploy-lifecycle hooks authored against `deployoor/plugin`:

```ts
import { definePlugin } from "deployoor/plugin";

export const discord = (options: { webhook: string }) =>
  definePlugin({
    name: "discord",
    onContractDeployed: async (ctx, { fetch }) => {
      if (ctx.reused) return; // no transaction happened on a reuse
      await fetch(options.webhook, {
        method: "POST",
        body: JSON.stringify({
          content: `${ctx.deployment.contractName} → ${ctx.deployment.address}`,
        }),
      });
    },
  });
```

Rules for a plugin package:

- Its own package under `packages/deployoor-<name>/`, published as `@deployoor/<name>`.
- `peerDependencies` on `deployoor` — never a regular dependency.
- Imports **only** from `deployoor/plugin`, never from `deployoor` internals.
- `unrun` in `devDependencies` (see below).
- Takes its side effects through injected `PluginDeps` (`{ fetch, now, log }`) so tests can substitute them.

Copy `packages/deployoor-slack/` as your starting skeleton — it's the smallest complete example.

**Keep `unrun` in every package's devDependencies.** tsdown's config loader declares it as an _optional_ peer, so pnpm skips it and a clean `--frozen-lockfile` build fails with "Failed to import module unrun".

## Commits and PRs

[Conventional Commits](https://www.conventionalcommits.org/), grouped into logical units — `fix(etherscan): …`, `feat(core): …`, `docs: …`. No mega-commits that mix a refactor with a feature.

Two house rules:

- **No AI co-author or "generated with" attribution lines** in commits or PR descriptions.
- **No "test plan" sections in PRs.** Verify before you open it, not after.

Describe what changed and why. If it's user-facing, the changeset already carries the release note.

## Reporting a bug

The most useful bug report includes your framework and version (Hardhat 2/3, Foundry, tevm), the relevant slice of `deployoor.config.ts`, and the tagged error name if you got one — `DeploymentFailed`, `LibrariesUnlinked`, `ArtifactsNotFound`, `NoChainOnClient`, `InvalidDeploymentRecord`, `PluginFailed`. A failing test against the in-memory EVM is the gold standard, and `@deployoor/testing` makes that a few lines.

## License

By contributing you agree your work is licensed under the [MIT License](LICENSE).
