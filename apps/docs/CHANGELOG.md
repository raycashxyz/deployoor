# @deployoor/docs

## 0.0.3

### Patch Changes

- c4846a1: Make deployoor.dev answer machine clients as well as browsers

  **A 404 an agent can recover from.** Nonexistent paths already returned a real 404; they now return a short Markdown body naming `llms.txt`, `llms-full.txt`, `AGENTS.md`, the sitemap, and the pages worth trying, for any client that did not ask for HTML. Browsers still get the styled page, which grew the same list of links. A missing static asset is left alone.

  **`/AGENTS.md`.** When to use deployoor and when not to, the install-generate-deploy sequence, the API surface a caller actually touches, and the assumptions that cost the most time (there is no `deployoor deploy` command; `on-change` is the default strategy; `deployers/` and `deployments/` are committed). `llms.txt` and `llms-full.txt` gained a "When to use deployoor" section pointing at it, plus a "Developer resources" list of the reference pages at absolute URLs.

  **Identity in JSON-LD.** `Organization`, `SoftwareApplication`, and `WebSite` blocks, cross-referenced by `@id`, alongside the per-page `TechArticle` Vocs already emits. An agent asking what this site is and who publishes it no longer has to read prose to find out.

  **Trust pages.** `/about`, `/contact`, and `/privacy` say who publishes deployoor (Raycash), where to report a bug or a vulnerability, and exactly what the site and the CLI do with data (no analytics, no cookies, no telemetry). Security reports have two private routes now: a GitHub advisory or hi@raycash.xyz. The pages are linked from the landing colophon and listed in the sitemap and `llms.txt`.

  `public/robots.txt` is now hand-written so it can point at those files, and the docs app gained `test` and `typecheck` scripts.

  **One canonical host.** `deployoor.dev` is primary and `www` redirects to it, so `siteUrl` names the apex. Every derived surface follows: `<base href>`, canonicals, `og:url`, the sitemap, the JSON-LD `@id`s, `robots.txt`, `AGENTS.md` and `llms.txt`. Pointing them at a host that redirects put a 308 in front of every internal link and made the canonical name a URL that redirected away from itself.

  **Findable by name.** The homepage carries a title and an `h1` that say what deployoor is rather than the wordmark alone, `/about` explains the spelling, and `SoftwareApplication` gained a `disambiguatingDescription`, because the name is one edit from "deployer" and gets read as a typo. Production builds submit the sitemap to IndexNow (`scripts/ping-indexnow.mjs`), which Bing, Yandex, Naver, Seznam and Yep act on in minutes.

## 0.0.2

### Patch Changes

- 0745971: Bring the docs, READMEs and examples in line with 0.7, and add a custom-paths example

  The examples' `deployers/` are now committed, and their `deployoor.config.ts` files are gone: all five set only `out` and `deploymentsPath` to the values that are already the defaults, so they demonstrated configuration nobody needs. `examples/custom-paths` is the one that does need a config, and shows exactly which paths require one.

  Stale prose corrected: three example READMEs described the deployers as gitignored; two referred to a config file that no longer exists; the root README listed `deployoor verify` and bytecode-diff redeploy as Planned when both shipped; TODO.md said nothing reads the pinned sources back.

- 3b54b89: Add a Verify contracts guide, a config step on the homepage, and drop the command tabs

  **New guide: [Verify contracts](https://deployoor.dev/guides/verify).** Both routes from one page — a verifier plugin at deploy time, and `deployoor verify` after the fact — plus what makes the second one possible (the record and its content-addressed standard-json sidecar), what each of the four verifiers needs, the three outcomes, and a troubleshooting section drawn from live runs rather than guesses.

  **The homepage gains a ninth, optional file: `deployoor.config.ts`.** It arrives last on purpose, after eight steps that never needed it — which is the honest way to introduce a file that is optional because every option has a default. The example shows moved folders, all four verifiers, and Slack.

  **The Install and Generate tabs are gone.** They existed to spell out a package manager and a per-framework compile, and `npx deployoor generate` now detects both: it reads the artifacts directory from your framework's own config and offers to install what is missing with the package manager your lockfile implies. The tabs described work the command does.

## 0.0.1

### Patch Changes

- b9a41cb: Rebuild the landing page around the project structure, and say that tests and deploys now need compiled artifacts.

  The homepage leads with the command, then walks the eight files a project actually gains — each with its contents, and which are optional. Three claims in the draft were falsified by 0.7 and are corrected: a deployer no longer bakes in the artifact — it carries the contract's name, its fully-qualified name and its abi, and reads bytecode and compiler settings from `artifacts/` at deploy time, which is why it is committable — the record's field is `constructorArgs`, and the emit is more than one file per contract.

  The testing guide never mentioned compiling, which 0.7 made load-bearing for anything deploying through a **generated** deployer. A hand-built `TypedArtifact` is the exception: it is used as given and never sends deployoor to disk.
