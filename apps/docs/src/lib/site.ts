/**
 * Facts about the site that more than one consumer needs: the Vocs config, the JSON-LD identity
 * blocks, and the Markdown 404 body all describe the same product and must not drift.
 *
 * Everything here is plain data on purpose. Vocs serializes its config (functions included, via
 * `Function.prototype.toString`) and re-creates it with `new Function` on the client, so a value
 * that reaches `head` must survive JSON — no closures, no imports evaluated at render time.
 */

/** Canonical origin. `www` 308-redirects here, so this is what `baseUrl` and every `@id` use. */
export const siteUrl = "https://deployoor.dev";

export const siteDescription =
  "Deploy EVM contracts from TypeScript with your own viem wallet. A deploy is an artifact plus a client, so scripts, tests, and your app share typed contract objects. Hardhat, Foundry, and tevm.";

export const repoUrl = "https://github.com/raycashxyz/deployoor";
export const issuesUrl = `${repoUrl}/issues`;
export const discussionsUrl = `${repoUrl}/discussions`;
export const securityUrl = `${repoUrl}/security/advisories/new`;
export const npmUrl = "https://www.npmjs.com/package/deployoor";
export const telegramUrl = "https://t.me/deployoor";
export const licenseUrl = "https://opensource.org/licenses/MIT";

/** Published contact address. Keep `src/pages/contact.mdx` showing the same one. */
export const contactEmail = "hi@raycash.xyz";

/** deployoor is published by Raycash; the schema says so rather than implying a company of one. */
export const publisherUrl = "https://www.raycash.xyz";

const organizationId = `${siteUrl}/#organization`;
const softwareId = `${siteUrl}/#deployoor`;
const websiteId = `${siteUrl}/#website`;

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  name: "deployoor",
  url: siteUrl,
  description:
    "deployoor publishes an MIT-licensed, viem-first contract deployment toolchain for EVM chains: a CLI, a deploy engine, and a set of plugins distributed on npm.",
  logo: {
    "@type": "ImageObject",
    url: `${siteUrl}/icon-512.png`,
    width: 512,
    height: 512,
  },
  founder: {
    "@type": "Person",
    name: "Valerio Leo",
  },
  email: contactEmail,
  sameAs: [repoUrl, npmUrl, telegramUrl, publisherUrl],
  parentOrganization: {
    "@type": "Organization",
    name: "Raycash",
    url: publisherUrl,
  },
  // No `address` yet. `PostalAddress` is valid with `addressCountry` alone, so one can be added
  // without publishing a street; it is left out until there is a true value to put there.
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "technical support",
      email: contactEmail,
      url: issuesUrl,
      availableLanguage: ["English"],
    },
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: telegramUrl,
      availableLanguage: ["English"],
    },
  ],
};

const softwareApplication = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": softwareId,
  name: "deployoor",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Smart contract deployment tooling",
  operatingSystem: "macOS, Linux, Windows",
  url: siteUrl,
  description: siteDescription,
  // One edit away from "deployer" and one letter from "deployor", so both engines and models
  // read the name as a typo. schema.org has a property for exactly this.
  disambiguatingDescription:
    "deployoor is spelled with a double o, the -oor agent noun of deploy. It is unrelated to Deployer, the PHP deployment tool, and to deployor.",
  downloadUrl: npmUrl,
  installUrl: npmUrl,
  softwareRequirements: "Node.js 18 or newer, viem 2, and Hardhat, Foundry, or tevm for compilation",
  programmingLanguage: "TypeScript",
  license: licenseUrl,
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Generate typed getOrDeploy functions from Hardhat, Foundry, or tevm artifacts",
    "Deploy with any viem wallet, including Privy, Turnkey, Coinbase CDP, Openfort, and hardware signers",
    "Record every deploy per chain as plain JSON in deployments/",
    "Reuse a recorded deployment instead of deploying twice, and redeploy on bytecode change",
    "Verify contracts on Etherscan, Sourcify, Blockscout, and Routescan from those records",
    "Consume deployments as typed viem objects or wagmi hooks via @wagmi/cli",
  ],
  softwareHelp: {
    "@type": "CreativeWork",
    name: "deployoor documentation",
    url: `${siteUrl}/introduction`,
  },
  author: { "@id": organizationId },
  publisher: { "@id": organizationId },
  sameAs: [repoUrl, npmUrl],
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": websiteId,
  name: "deployoor",
  alternateName: "deployoor documentation",
  url: siteUrl,
  description: siteDescription,
  inLanguage: "en",
  publisher: { "@id": organizationId },
  about: { "@id": softwareId },
};

/** Escapes what would otherwise let a value break out of the `<script>` tag holding it. */
const serialize = (entity: object) =>
  JSON.stringify(entity).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      ({
        "<": "\\u003c",
        ">": "\\u003e",
        "&": "\\u0026",
        "\u2028": "\\u2028",
        "\u2029": "\\u2029",
      })[character] ?? character,
  );

/**
 * Identity blocks, rendered by `src/pages/_layout.tsx`.
 *
 * Separate blocks rather than one `@graph`: a consumer that only reads the top-level `@type` of
 * each script still finds `Organization` and `SoftwareApplication`. The `@id` references tie them
 * together for consumers that follow them.
 *
 * The layout, not Vocs' `head.script` config: Vocs renders `Head` twice per page (once from the
 * root with `includeJsonLd: false`, once from the page) and only dedupes `title`, `meta` and
 * `link`, so anything passed through `head.script` ships twice. The layout renders once. Vocs' own
 * page-level `TechArticle` block already sits in the body, so these are in good company there.
 */
export const structuredDataBlocks = [organization, softwareApplication, website].map((entity) => ({
  id: entity["@id"],
  json: serialize(entity),
}));
