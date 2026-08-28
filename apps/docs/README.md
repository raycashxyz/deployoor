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

`build` is `vocs build`, then `node scripts/augment-llms.mjs`, then `node scripts/ping-indexnow.mjs`
(see [Search](#search)). The first of those adds the "When to use
deployoor" and "Developer resources" sections to the generated `llms.txt` and `llms-full.txt`. Vocs
regenerates both files from the page tree on every build and exposes no hook for extra content, so
the sections are added afterwards rather than by hand — a hand-written `public/llms.txt` would
replace the generated page list with one that goes stale.

## Checks

```bash
pnpm --filter @deployoor/docs typecheck
pnpm --filter @deployoor/docs test
```

## What agents see

The site answers machine clients as well as browsers, and the pieces that make it do so live here:

| Surface                                                | Where it comes from                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `/llms.txt`, `/llms-full.txt`                          | Vocs, then `scripts/augment-llms.mjs`                                          |
| `/AGENTS.md`                                           | `public/AGENTS.md` (hand-written; `/agents.md` redirects to it)                |
| `/robots.txt`                                          | `public/robots.txt` (hand-written, so Vocs skips generating one)               |
| Markdown 404 for non-HTML clients                      | `src/middleware/not-found.ts` + `src/lib/not-found.ts`                         |
| HTML 404 with recovery links                           | `src/pages/404.tsx` (overrides Vocs' built-in, and is kept out of the sitemap) |
| `Organization`/`SoftwareApplication`/`WebSite` JSON-LD | `src/lib/site.ts`, rendered by `src/pages/_layout.tsx`                         |
| `/about`, `/contact`, `/privacy`                       | pages under `src/pages`, linked from the landing colophon                      |

Verify them against a build with `pnpm --filter @deployoor/docs preview`:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:4173/no-such-page
# 404 text/markdown; charset=utf-8
```

## Search

`siteUrl` in `src/lib/site.ts` is the only place the canonical host is written. Vocs turns it into
`baseUrl`, which drives `<base>`, the canonical link, `og:url`, the sitemap and every JSON-LD `@id`;
`public/robots.txt`, `public/AGENTS.md` and `scripts/augment-llms.mjs` name the same origin, and the
tests fail if any of them drift. It has to match the primary domain in Vercel: a canonical that
names a host which redirects sends every crawler and every internal link through a hop.

A production build submits the sitemap to IndexNow (`scripts/ping-indexnow.mjs`), which Bing,
Yandex, Naver, Seznam and Yep act on within minutes. Google does not take part, so it stays on
Search Console. Ownership is proved by serving the key at `/<key>.txt`, so
`public/dd940ad0733dd6e7618d884fc5a04493.txt` is published on purpose rather than kept secret. The
host and the key location are read back out of the built sitemap, so they cannot disagree with the
URLs being submitted. Off production the step logs and skips, and a failed request never fails the
build.

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
