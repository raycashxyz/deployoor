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

Connect the repo in the [Vercel dashboard](https://vercel.com/new) (`raycashxyz/deployoor`):

1. **Root Directory:** `apps/docs`
2. Enable **Include source files outside of the Root Directory** (required for the pnpm monorepo)
3. Leave **Install** / **Build** / **Output Directory** empty — `apps/docs/vercel.json` sets install/build and Vocs supplies the output
4. **Framework preset:** Other
5. Deploy, then add **deployoor.dev** under Settings → Domains

The Root Directory must be `apps/docs`, not the monorepo root. This lets Vocs emit its dynamic `/api/og` function directly through the normal Vercel build output.

Dashboard: [vercel.com/raycash/deployoor-docs](https://vercel.com/raycash/deployoor-docs)

`apps/docs/vercel.json` runs install from the monorepo root (`cd ../.. && pnpm install`) so workspace overrides apply.

Vocs auto-detects Vercel via the `VERCEL` environment variable.
