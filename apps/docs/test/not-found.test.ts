import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  looksLikeAsset,
  markdownNotFoundResponse,
  notFoundMarkdown,
  prefersMarkdown,
  recoveryLinks,
} from "../src/lib/not-found";
import { siteUrl } from "../src/lib/site";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("prefersMarkdown", () => {
  it("returns false when the client asks for HTML", () => {
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
  });

  it("returns false for an XHTML-only client", () => {
    expect(prefersMarkdown("application/xhtml+xml")).toBe(false);
  });

  it("returns true for a wildcard Accept, which is what HTTP clients send", () => {
    expect(prefersMarkdown("*/*")).toBe(true);
  });

  it("returns true when no Accept header was sent", () => {
    expect(prefersMarkdown(undefined)).toBe(true);
  });

  it("returns true when Markdown is asked for explicitly, even alongside HTML", () => {
    expect(prefersMarkdown("text/markdown, text/html;q=0.5")).toBe(true);
  });

  it("ignores header casing", () => {
    expect(prefersMarkdown("TEXT/HTML")).toBe(false);
    expect(prefersMarkdown("TEXT/MARKDOWN")).toBe(true);
  });

  it("does not select Markdown when its quality is zero", () => {
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });

  it("selects Markdown when HTML is refused and a wildcard remains", () => {
    expect(prefersMarkdown("text/html;q=0, */*;q=0.8")).toBe(true);
  });
});

describe("notFoundMarkdown", () => {
  const body = notFoundMarkdown("/does-not-exist");

  it("opens with a 404 heading", () => {
    expect(body.startsWith("# 404 Not Found\n")).toBe(true);
  });

  it("names the path that was requested", () => {
    expect(body).toContain("`/does-not-exist` is not a page on deployoor.dev.");
  });

  it("points at the machine-readable index, the full docs, and the sitemap", () => {
    expect(body).toContain(`${siteUrl}/llms.txt`);
    expect(body).toContain(`${siteUrl}/llms-full.txt`);
    expect(body).toContain(`${siteUrl}/sitemap.xml`);
    expect(body).toContain(`${siteUrl}/AGENTS.md`);
  });

  it("explains how to fetch any page as Markdown", () => {
    expect(body).toContain("Accept: text/markdown");
  });

  it("links every recovery target absolutely, so no base URL is needed to follow one", () => {
    expect(
      recoveryLinks
        .map(({ path: linkPath, label }) => `[${label}](${siteUrl}${linkPath})`)
        .filter((link) => !body.includes(link)),
    ).toEqual([]);
  });

  it("keeps an echoed path to one bounded line", () => {
    const hostile = `/${"a".repeat(400)}\n# injected\n\`\`\``;
    const hostileBody = notFoundMarkdown(hostile);
    const [, , echoLine] = hostileBody.split("\n");

    expect(echoLine.length).toBeLessThan(200);
    expect(hostileBody).not.toContain("# injected");
    expect(hostileBody).not.toContain("```");
  });

  it("collapses a newline in the path instead of letting it start a line", () => {
    expect(notFoundMarkdown("/x\n## injected")).toContain("`/x## injected` is not a page");
  });

  it("falls back to the root path when there is nothing to echo", () => {
    expect(notFoundMarkdown("")).toContain("`/` is not a page");
  });
});

describe("looksLikeAsset", () => {
  it("recognises a missing static file, where a Markdown body would go unread", () => {
    expect(looksLikeAsset("/hero.webp")).toBe(true);
    expect(looksLikeAsset("/assets/index-abc123.js")).toBe(true);
    expect(looksLikeAsset("/site.webmanifest")).toBe(true);
  });

  it("treats documentation paths as pages, extension or not", () => {
    expect(looksLikeAsset("/guides/deploy")).toBe(false);
    expect(looksLikeAsset("/guides/deploy.md")).toBe(false);
    expect(looksLikeAsset("/llms.txt")).toBe(false);
    expect(looksLikeAsset("/")).toBe(false);
  });

  it("ignores extension casing", () => {
    expect(looksLikeAsset("/guides/deploy.MD")).toBe(false);
    expect(looksLikeAsset("/logo.PNG")).toBe(true);
  });
});

describe("markdownNotFoundResponse", () => {
  const response = markdownNotFoundResponse("/nope");

  it("keeps the 404 status", () => {
    expect(response.status).toBe(404);
  });

  it("declares Markdown, not HTML", () => {
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });

  it("varies on the headers the representation depends on", () => {
    expect(response.headers.get("vary")).toBe("Accept, User-Agent");
  });

  it("carries the Markdown body", async () => {
    await expect(response.text()).resolves.toContain("# 404 Not Found");
  });
});

describe("recoveryLinks", () => {
  it("points every page link at a page that exists", () => {
    const pages = recoveryLinks.filter(({ file }) => !file);
    expect(pages.length).toBeGreaterThan(0);

    expect(
      pages
        .map(({ path: linkPath }) => path.join(docsRoot, "src/pages", `${linkPath}.mdx`))
        .filter((source) => !existsSync(source)),
    ).toEqual([]);
  });

  it("ships the static files it links that are not build output", () => {
    expect(existsSync(path.join(docsRoot, "public/AGENTS.md"))).toBe(true);
  });
});
