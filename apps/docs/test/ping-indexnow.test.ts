import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSubmission, indexNowKey, parseSitemapUrls, shouldSubmit } from "../scripts/ping-indexnow.mjs";
import { siteUrl } from "../src/lib/site";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>2026-08-12</lastmod>
  </url>
  <url>
    <loc>${siteUrl}/introduction</loc>
  </url>
</urlset>`;

describe("parseSitemapUrls", () => {
  it("reads every location the sitemap lists, in order", () => {
    expect(parseSitemapUrls(sitemap)).toEqual([`${siteUrl}/`, `${siteUrl}/introduction`]);
  });

  it("takes locations only, leaving the other sitemap tags alone", () => {
    expect(parseSitemapUrls(sitemap).some((url) => url.includes("2026-08-12"))).toBe(false);
  });

  it("returns nothing for a sitemap with no URLs, rather than an empty string", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });
});

describe("buildSubmission", () => {
  const submission = buildSubmission(parseSitemapUrls(sitemap));

  it("takes the host from the URLs being submitted, so the two cannot disagree", () => {
    expect(submission?.host).toBe(new URL(siteUrl).host);
  });

  it("points at the key file served from that same host", () => {
    expect(submission?.keyLocation).toBe(`${siteUrl}/${indexNowKey}.txt`);
    expect(submission?.key).toBe(indexNowKey);
  });

  it("submits every URL in the sitemap", () => {
    expect(submission?.urlList).toEqual([`${siteUrl}/`, `${siteUrl}/introduction`]);
  });

  it("builds nothing when the sitemap listed nothing, so the caller can skip the request", () => {
    expect(buildSubmission([])).toBeUndefined();
  });
});

describe("shouldSubmit", () => {
  it("submits on a production build", () => {
    expect(shouldSubmit({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("stays quiet on previews and local builds, whose host the key does not cover", () => {
    expect(shouldSubmit({ VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldSubmit({})).toBe(false);
  });
});

describe("key file", () => {
  it("serves the key at the path the submission claims, with the key as its body", () => {
    const keyFile = readFileSync(path.join(docsRoot, "public", `${indexNowKey}.txt`), "utf-8");

    expect(keyFile.trim()).toBe(indexNowKey);
  });

  it("uses a key of the length IndexNow accepts", () => {
    expect(indexNowKey).toMatch(/^[a-f0-9]{8,128}$/);
  });
});
