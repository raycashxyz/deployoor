/**
 * Adds agent guidance to the generated `llms.txt` and `llms-full.txt`.
 *
 * Vocs generates both files from the page tree at `buildEnd`: a title, the site description, and a
 * flat list of every page. That answers "what pages exist" and nothing else, so an agent deciding
 * whether deployoor fits a task has to read the docs to find out. The sections added here answer it
 * up front, and point at `/AGENTS.md` for the commands.
 *
 * It runs as a build step rather than a Vocs option because Vocs exposes no hook for extra
 * `llms.txt` content, and writing `public/llms.txt` by hand would replace the generated page list
 * with one that goes stale. `vocs build` rewrites both files from scratch on every build, so this
 * always augments fresh output.
 *
 * Usage: `node scripts/augment-llms.mjs` from `apps/docs`, after `vocs build`.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
 * Canonical origin for the absolute links below. Mirrors `siteUrl` in `src/lib/site.ts`, which
 * this plain `.mjs` build script cannot import; `test/augment-llms.test.ts` asserts they agree.
 */
const siteUrl = "https://deployoor.dev";

const whenToUseHeading = "## When to use deployoor";

const whenToUse = `${whenToUseHeading}

deployoor deploys EVM smart contracts from TypeScript with a viem wallet client you supply, records
every deploy as plain JSON under \`deployments/<chainId>-<network>/\`, and hands back a typed viem
contract object. It is an MIT-licensed npm package: no account, no API key, no hosted service.

Reach for it to:

- deploy a contract from a TypeScript script, with no framework runtime booted
- deploy the same contracts to several chains in one loop over viem clients
- make a deploy step idempotent, reusing a record unless the bytecode, constructor args or linked
  libraries changed
- sign with a wallet other than a raw private key: an encrypted keystore, cloud KMS, a Ledger,
  Privy, Turnkey, Coinbase CDP, Openfort, or a JSON-RPC account
- give an app typed contract access with no copied addresses or ABIs, through \`@deployoor/wagmi\`
- run integration tests over the real deploy path, in memory, through \`@deployoor/testing\`
- verify already-deployed contracts from committed records, with no recompile

Look elsewhere to compile or test Solidity (that stays with Hardhat or Foundry), to run a local
chain for a person to use, to orchestrate proxy upgrades, or if the project has no TypeScript.

How an agent should drive it: \`pnpm add -D deployoor viem\`, compile, then \`npx deployoor generate\`
to write \`./deployers/\`, then call the generated \`getOrDeploy<Contract>({ walletClient,
publicClient, args })\` from an ordinary Node script. Full instructions, including the API surface
and the mistakes that cost the most time, are at ${siteUrl}/AGENTS.md.`;

const developerResources = `## Developer resources

- [AGENTS.md](${siteUrl}/AGENTS.md): when to use deployoor and how to add it to a project, for agents
- [CLI reference](${siteUrl}/reference/cli): every command and flag for \`init\`, \`generate\` and \`verify\`
- [Configuration reference](${siteUrl}/guides/configuration): every \`deployoor.config.ts\` option and its default
- [Deployment record format](${siteUrl}/concepts/deployment-records): the JSON contract between deploying and consuming
- [Plugin hooks](${siteUrl}/guides/plugins): the deploy lifecycle and the \`deployoor/plugin\` SDK
- [Packages](${siteUrl}/packages): every published package and what it is for
- [llms-full.txt](${siteUrl}/llms-full.txt): the whole documentation as one Markdown file
- [Any page as Markdown](${siteUrl}/reference/cli.md): append \`.md\` to a path, or send \`Accept: text/markdown\`
- [Source on GitHub](https://github.com/raycashxyz/deployoor): monorepo holding the engine, the plugins and these docs
- [deployoor on npm](https://www.npmjs.com/package/deployoor): releases, versions and install size`;

/** First line of generated body content: a page link, or the sitemap comment in `llms-full.txt`. */
const isBodyStart = (line) => line.startsWith("- [") || line.startsWith("<!--");

const splitHead = (content) => {
  const lines = content.split("\n");
  const bodyIndex = lines.findIndex(isBodyStart);
  if (bodyIndex === -1) return undefined;
  return {
    head: lines.slice(0, bodyIndex).join("\n").trimEnd(),
    body: lines.slice(bodyIndex).join("\n").trimEnd(),
  };
};

/**
 * `llms.txt`: guidance, then the generated page list under its own heading, then the resource list.
 *
 * The generated list gets a `## Documentation` heading so every link in the file sits under a
 * section, which is the shape llmstxt.org describes.
 */
export const augmentLlmsTxt = (content) => {
  if (content.includes(whenToUseHeading)) return content;
  const parts = splitHead(content);
  if (!parts) return content;
  return `${parts.head}\n\n${whenToUse}\n\n## Documentation\n\n${parts.body}\n\n${developerResources}\n`;
};

/** `llms-full.txt`: the same guidance ahead of the page contents, which already say the rest. */
export const augmentLlmsFullTxt = (content) => {
  if (content.includes(whenToUseHeading)) return content;
  const parts = splitHead(content);
  if (!parts) return content;
  return `${parts.head}\n\n${whenToUse}\n\n${parts.body}\n`;
};

const targets = [
  { file: "llms.txt", augment: augmentLlmsTxt },
  { file: "llms-full.txt", augment: augmentLlmsFullTxt },
];

/**
 * Every output tree the build produced.
 *
 * `dist/public` is Vocs' own output. On Vercel, Waku's build enhancer has already *copied* it into
 * `.vercel/output/static` by the time this script runs — separate files, so writing only to
 * `dist/public` augments the copy nobody deploys. Both get written; whichever exists.
 */
export const resolveOutputRoots = (candidates, exists) => candidates.filter(exists);

const main = async () => {
  const roots = resolveOutputRoots(
    ["dist/public", path.join(".vercel", "output", "static")].map((root) =>
      path.resolve(process.cwd(), root),
    ),
    existsSync,
  );
  if (roots.length === 0)
    throw new Error("augment-llms: no build output found. Run `vocs build` before this script.");

  const results = await Promise.all(
    roots.flatMap((root) =>
      targets.map(async ({ file, augment }) => {
        const filePath = path.join(root, file);
        const content = await readFile(filePath, "utf-8").catch(() => undefined);
        if (content === undefined)
          throw new Error(`augment-llms: ${filePath} is missing. Run \`vocs build\` before this script.`);

        const relative = path.relative(process.cwd(), filePath);
        const augmented = augment(content);
        if (augmented === content) return `${relative}: already carried the guidance, left alone`;
        await writeFile(filePath, augmented, "utf-8");
        return `${relative}: added agent guidance`;
      }),
    ),
  );

  results.forEach((result) => console.log(`augment-llms: ${result}`));
};

// Only the CLI path touches the filesystem; the transforms above are imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
