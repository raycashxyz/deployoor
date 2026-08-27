/**
 * Submits the built sitemap to IndexNow after a production build.
 *
 * Bing, Yandex, Naver, Seznam and Yep crawl a submitted URL within minutes rather than waiting to
 * rediscover it; Google does not participate, so Search Console stays the route there. Ownership is
 * proved by serving the key at `/<key>.txt`, which is why the key is a committed file in `public/`
 * and not a secret.
 *
 * Everything the request needs comes out of the sitemap Vocs just wrote: its `<loc>` entries are
 * absolute and built from `baseUrl`, so the host and the key location can never disagree with the
 * URLs being submitted.
 *
 * Usage: `node scripts/ping-indexnow.mjs` from `apps/docs`, after `vocs build`.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { resolveOutputRoots } from "./augment-llms.mjs";

/** Matches `public/<key>.txt`, whose body is this same string. Public by design. */
export const indexNowKey = "dd940ad0733dd6e7618d884fc5a04493";

export const endpoint = "https://api.indexnow.org/indexnow";

/**
 * Only a production build. A preview lives on a per-deployment host the key file does not cover,
 * and IndexNow rejects a submission whose URLs sit off the verified host.
 */
export const shouldSubmit = (env) => env.VERCEL_ENV === "production";

export const parseSitemapUrls = (xml) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url.trim()).filter(Boolean);

/** `undefined` when there is nothing to submit, so the caller has one thing to check. */
export const buildSubmission = (urls, key = indexNowKey) => {
  const [first] = urls;
  if (!first) return undefined;
  const { host, origin } = new URL(first);
  return { host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls };
};

const readSitemap = async (roots) => {
  const candidates = roots.map((root) => path.join(root, "sitemap.xml")).filter(existsSync);
  const [sitemapPath] = candidates;
  if (!sitemapPath) return undefined;
  return readFile(sitemapPath, "utf-8");
};

const main = async () => {
  if (!shouldSubmit(process.env)) return console.log("ping-indexnow: not a production build, skipped");

  const roots = resolveOutputRoots(
    ["dist/public", path.join(".vercel", "output", "static")].map((root) =>
      path.resolve(process.cwd(), root),
    ),
    existsSync,
  );
  const sitemap = await readSitemap(roots);
  if (sitemap === undefined)
    throw new Error("ping-indexnow: no sitemap.xml in the build output. Run `vocs build` first.");

  const submission = buildSubmission(parseSitemapUrls(sitemap));
  if (!submission) return console.log("ping-indexnow: sitemap listed no URLs, skipped");

  // A search engine being unreachable is not a reason to fail a deploy, so the outcome is
  // logged rather than thrown.
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(submission),
  }).catch((error) => error);

  if (response instanceof Error) return console.log(`ping-indexnow: submission failed (${response.message})`);
  console.log(
    `ping-indexnow: submitted ${submission.urlList.length} URLs for ${submission.host}, ${response.status} ${response.statusText}`,
  );
};

// Only the CLI path reads the filesystem or the network; the transforms above are imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
