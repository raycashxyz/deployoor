/**
 * What a 404 says, in both representations.
 *
 * Vocs' built-in 404 is a styled HTML page with a single "Back to home" link. A person can work
 * with that; a program cannot — it gets an app shell it has to parse and one link that drops it at
 * the top of the site. So the same recovery list is served two ways: rendered on the HTML page
 * (`src/pages/404.tsx`) and as a Markdown body for clients that did not ask for HTML
 * (`src/middleware/not-found.ts`).
 */

import { siteUrl } from "./site";

export type RecoveryLink = {
  /** Site-relative, so the HTML page keeps working on preview deployments. */
  path: string;
  label: string;
  note: string;
  /** Static file rather than a page: rendered as a plain anchor, not a router link. */
  file?: boolean;
};

export const recoveryLinks: RecoveryLink[] = [
  {
    path: "/introduction",
    label: "Introduction",
    note: "what deployoor is and how it works",
  },
  {
    path: "/getting-started/installation",
    label: "Installation",
    note: "install it and generate typed deployers",
  },
  {
    path: "/reference/cli",
    label: "CLI reference",
    note: "every command and flag",
  },
  {
    path: "/llms.txt",
    label: "llms.txt",
    note: "every page as a link list, plus when to use deployoor",
    file: true,
  },
  {
    path: "/llms-full.txt",
    label: "llms-full.txt",
    note: "the whole documentation as one Markdown file",
    file: true,
  },
  {
    path: "/AGENTS.md",
    label: "AGENTS.md",
    note: "how to add deployoor to a project from an agent",
    file: true,
  },
  {
    path: "/sitemap.xml",
    label: "sitemap.xml",
    note: "every indexable URL",
    file: true,
  },
];

/** Requested path, safe to echo into a Markdown body: single line, bounded length. */
const describeRequestPath = (pathname: string) => {
  const sanitized = pathname.replace(/[`\r\n]/g, "").slice(0, 120);
  return sanitized || "/";
};

export const notFoundMarkdown = (pathname: string) =>
  [
    "# 404 Not Found",
    "",
    `\`${describeRequestPath(pathname)}\` is not a page on deployoor.dev.`,
    "",
    "## Where to look next",
    "",
    ...recoveryLinks.map(({ path, label, note }) => `- [${label}](${siteUrl}${path}): ${note}`),
    "",
    "Every page is also available as Markdown: append `.md` to its path, or send an",
    "`Accept: text/markdown` request header.",
    "",
  ].join("\n");

/**
 * Whether this request should get the Markdown 404 rather than the HTML page.
 *
 * A browser always names `text/html` in `Accept`; HTTP clients and agents send a wildcard,
 * nothing at all, or ask for Markdown outright. Deciding on the header rather than a
 * user-agent table means no list to maintain as agents come and go.
 */
export const prefersMarkdown = (accept: string | undefined) => {
  const value = accept?.toLowerCase() ?? "";
  if (value.includes("text/markdown")) return true;
  return !value.includes("text/html") && !value.includes("application/xhtml+xml");
};

/**
 * Whether the path points at a static asset rather than a documentation route.
 *
 * A missing image or stylesheet is still a 404, but a Markdown body helps nobody there: the browser
 * never shows it. Same test Vocs' Markdown router uses to skip twin resolution, with `.md` and
 * `.txt` kept because those are documentation.
 */
export const looksLikeAsset = (pathname: string) => {
  const filename = pathname.split("/").pop() ?? "";
  return filename.includes(".") && !/\.(md|txt)$/i.test(filename);
};

export const markdownNotFoundResponse = (pathname: string) =>
  new Response(notFoundMarkdown(pathname), {
    status: 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      // Same pair Vocs varies on for its Markdown twins, so a cache never serves one
      // representation to a client that asked for the other.
      Vary: "Accept, User-Agent",
    },
  });
