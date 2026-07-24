import { Changelog, defineConfig } from "vocs/config";

// Set this ONLY where the public hostname is known — i.e. production.
//
// Vocs turns `baseUrl` into a `<base href="…">` tag, and `<base>` re-resolves *every* relative
// URL on the page. So a baseUrl that isn't the host actually serving the page silently breaks
// the whole site: markup like `src="/og.png"` and `href="/getting-started/installation"` stays
// relative in the HTML but the browser resolves it against `<base>` instead.
//
// This previously used `https://${VERCEL_URL}` on previews. VERCEL_URL is the *per-deployment*
// host (`<project>-<hash>-<team>.vercel.app`), not the branch alias you open from a PR, so every
// asset and link on a branch preview pointed at a different origin — and since this project has
// Vercel Authentication on all deployments except custom domains, that origin demands SSO. Net
// effect: broken hero image and nav links on every preview.
//
// Leaving it undefined off production means no `<base>` is emitted and relative URLs resolve
// against whichever host serves them — branch alias, deployment URL, or localhost. The tradeoff
// is that previews carry no canonical/og:url/og:image; that costs nothing here, because those
// only matter to external crawlers and no crawler can reach an SSO-gated preview anyway. To
// review a change to the OG image itself, open `/api/og?title=…` on the preview directly.
const baseUrl = process.env.VERCEL_ENV === "production" ? "https://www.deployoor.dev" : undefined;

const githubChangelog = Changelog.github({ repo: "raycashxyz/deployoor" });
const deployoorChangelog = Changelog.from({
  type: "deployoor-ecosystem",
  async fetch(options) {
    const releases = await githubChangelog.fetch({ ...options, limit: 100 });
    const limit = options?.limit ?? releases.length;
    const coreReleases = releases.filter((release) => release.version.startsWith("deployoor@"));
    const ecosystemReleases = releases.filter((release) => release.version.startsWith("@deployoor/"));

    return [...coreReleases, ...ecosystemReleases].slice(0, limit);
  },
});

export default defineConfig({
  title: "deployoor",
  description:
    "Quality-of-life for smart contract teams — simplify chain ops. Deploy once, use typed viem contract objects in your apps and tests. Hardhat, Foundry, and tevm.",
  baseUrl,
  // Keep docs pages prerendered while allowing Vocs' dynamic OG endpoint to run on Vercel.
  renderStrategy: "partial-static",
  mcp: { enabled: false },
  accentColor: "light-dark(#111513, #BEF4BE)",
  colorScheme: "light dark",
  themeColor: "light-dark(#BEF4BE, #111513)",
  logoUrl: {
    light: "/favicon.svg",
    dark: "/favicon-dark.svg",
  },
  iconUrl: "/favicon.svg",
  ogImageUrl: (_path, { baseUrl }) => `${baseUrl ?? ""}/api/og?title=%title&description=%description`,
  changelog: deployoorChangelog,
  socials: [
    { icon: "telegram", link: "https://t.me/deployoor" },
    { icon: "github", link: "https://github.com/raycashxyz/deployoor" },
  ],
  topNav: [
    { text: "Docs", link: "/getting-started/installation" },
    { text: "Changelog", link: "/changelog" },
  ],
  sidebar: [
    {
      text: "Introduction",
      link: "/introduction",
    },
    {
      text: "Comparison",
      link: "/comparison",
    },
    {
      text: "Getting started",
      items: [
        { text: "Installation", link: "/getting-started/installation" },
        { text: "Quickstart", link: "/getting-started/quickstart" },
      ],
    },
    {
      text: "Guides",
      items: [
        { text: "Deploy scripts", link: "/guides/deploy" },
        { text: "Configuration", link: "/guides/configuration" },
        { text: "Testing", link: "/guides/testing" },
        { text: "Consume in your app", link: "/guides/consumption" },
        { text: "Plugins", link: "/guides/plugins" },
        { text: "Hardhat", link: "/guides/hardhat" },
        { text: "Foundry", link: "/guides/foundry" },
        { text: "TEVM", link: "/guides/tevm" },
        { text: "Migrate from hardhat-deploy", link: "/guides/migrate-from-hardhat-deploy" },
      ],
    },
    {
      text: "Concepts",
      items: [
        { text: "Deployment records", link: "/concepts/deployment-records" },
        { text: "Idempotent deploys", link: "/concepts/idempotency" },
      ],
    },
    {
      text: "Reference",
      items: [{ text: "CLI", link: "/reference/cli" }],
    },
    {
      text: "Packages",
      link: "/packages",
    },
  ],
});
