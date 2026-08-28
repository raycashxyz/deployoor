---
"@deployoor/docs": patch
---

Make deployoor.dev answer machine clients as well as browsers

**A 404 an agent can recover from.** Nonexistent paths already returned a real 404; they now return a short Markdown body naming `llms.txt`, `llms-full.txt`, `AGENTS.md`, the sitemap, and the pages worth trying, for any client that did not ask for HTML. Browsers still get the styled page, which grew the same list of links. A missing static asset is left alone.

**`/AGENTS.md`.** When to use deployoor and when not to, the install-generate-deploy sequence, the API surface a caller actually touches, and the assumptions that cost the most time (there is no `deployoor deploy` command; `on-change` is the default strategy; `deployers/` and `deployments/` are committed). `llms.txt` and `llms-full.txt` gained a "When to use deployoor" section pointing at it, plus a "Developer resources" list of the reference pages at absolute URLs.

**Identity in JSON-LD.** `Organization`, `SoftwareApplication`, and `WebSite` blocks, cross-referenced by `@id`, alongside the per-page `TechArticle` Vocs already emits. An agent asking what this site is and who publishes it no longer has to read prose to find out.

**Trust pages.** `/about`, `/contact`, and `/privacy` say who publishes deployoor (Raycash), where to report a bug or a vulnerability, and exactly what the site and the CLI do with data (no analytics, no cookies, no telemetry). Security reports have two private routes now: a GitHub advisory or hi@raycash.xyz. The pages are linked from the landing colophon and listed in the sitemap and `llms.txt`.

`public/robots.txt` is now hand-written so it can point at those files, and the docs app gained `test` and `typecheck` scripts.

**One canonical host.** `deployoor.dev` is primary and `www` redirects to it, so `siteUrl` names the apex. Every derived surface follows: `<base href>`, canonicals, `og:url`, the sitemap, the JSON-LD `@id`s, `robots.txt`, `AGENTS.md` and `llms.txt`. Pointing them at a host that redirects put a 308 in front of every internal link and made the canonical name a URL that redirected away from itself.

**Findable by name.** The homepage carries a title and an `h1` that say what deployoor is rather than the wordmark alone, `/about` explains the spelling, and `SoftwareApplication` gained a `disambiguatingDescription`, because the name is one edit from "deployer" and gets read as a typo. Production builds submit the sitemap to IndexNow (`scripts/ping-indexnow.mjs`), which Bing, Yandex, Naver, Seznam and Yep act on in minutes.
