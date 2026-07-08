# @deployoor/docs

Documentation site for [deployoor](https://deployoor.dev), built with [Vocs](https://vocs.dev) v2.

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @deployoor/docs dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
pnpm --filter @deployoor/docs build
pnpm --filter @deployoor/docs preview
```

## Deploy to Vercel

### Option A — Vercel dashboard (recommended)

1. [Import the repo](https://vercel.com/new) (`raycashxyz/deployoor`)
2. **Root Directory:** `apps/docs`
3. Enable **Include source files outside of the Root Directory** (required for the pnpm monorepo)
4. Leave **Install** / **Build** empty — `apps/docs/vercel.json` sets them
5. **Framework preset:** Other
6. Deploy, then add **deployoor.dev** under Settings → Domains

### Option B — Deploy (GitHub Actions only)

Docs deploy automatically on push to `main` when `apps/docs/` changes.

Do **not** run local `pnpm docs:deploy` — use the GitHub Actions workflow (`.github/workflows/docs-deploy.yml`).

Dashboard: [vercel.com/raycash/deployoor-docs](https://vercel.com/raycash/deployoor-docs)

### Option C — GitHub Actions (auto-deploy on push to `main`)

GitHub repo secrets (raycash team):

| Secret              | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | [Vercel account token](https://vercel.com/account/tokens) with access to **raycash** |
| `VERCEL_ORG_ID`     | `team_DHmgXndhGMn6I3jq2kpBQr4W` (raycash)                                            |
| `VERCEL_PROJECT_ID` | `prj_HaqseyJIYjK2FReuqwMOTIn2aWc2` (deployoor-docs)                                  |

Pushes to `main` that touch `apps/docs/` run `.github/workflows/docs-deploy.yml`.

`apps/docs/vercel.json` runs install from the monorepo root (`cd ../.. && pnpm install`) so workspace overrides (e.g. `es-module-lexer@2.3.0`) apply.

Vocs auto-detects Vercel via the `VERCEL` environment variable.
