import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "deployoor",
  description:
    "Quality-of-life for smart contract teams — simplify chain ops. Deploy once, use typed viem contract objects in your apps and tests. Hardhat and Foundry.",
  baseUrl: "https://deployoor.dev",
  renderStrategy: "full-static",
  mcp: { enabled: false },
  accentColor: "light-dark(#111513, #BEF4BE)",
  colorScheme: "light dark",
  themeColor: "light-dark(#BEF4BE, #111513)",
  logoUrl: {
    light: "/favicon.svg",
    dark: "/favicon-dark.svg",
  },
  iconUrl: "/favicon.svg",
  ogImageUrl: "/og.png",
  topNav: [
    { text: "Docs", link: "/getting-started/installation" },
    { text: "Reference", link: "/reference/cli" },
    { text: "Packages", link: "/packages" },
    {
      text: "GitHub",
      link: "https://github.com/raycashxyz/deployoor",
    },
  ],
  sidebar: [
    {
      text: "Introduction",
      link: "/introduction",
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
