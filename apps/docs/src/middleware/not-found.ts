/**
 * Serves the Markdown 404 to clients that did not ask for HTML.
 *
 * Vocs' `mdRouter` negotiates Markdown for pages that exist; a path that does not exist has no
 * Markdown twin to serve, so it falls through to the HTML 404 and a program gets an app shell.
 * This runs inside that fall-through: everything downstream still decides the status, and only a
 * 404 is rewritten.
 *
 * Files under `src/middleware/` are picked up by Vocs' server entry and appended to its own
 * middleware chain (`vocs/waku/middleware`), so this runs after `mdRouter`, `redirects` and
 * `trailingSlash` have had their say — a redirect still redirects, and an existing page still
 * renders.
 */

import type { MiddlewareHandler } from "hono";

import { looksLikeAsset, markdownNotFoundResponse, prefersMarkdown } from "../lib/not-found";

const middleware = (): MiddlewareHandler => async (context, next) => {
  await next();

  if (context.res.status !== 404) return;
  if (!prefersMarkdown(context.req.header("accept"))) return;

  const { pathname } = new URL(context.req.url);
  if (looksLikeAsset(pathname)) return;

  context.res = markdownNotFoundResponse(pathname);
};

export default middleware;
