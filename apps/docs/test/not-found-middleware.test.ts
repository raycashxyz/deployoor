import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import notFoundMiddleware from "../src/middleware/not-found";

/**
 * Stands in for the Vocs server: a page that exists, and Hono's own 404 fallback for everything
 * else. The middleware is registered the way Vocs' adapter registers it, so what is asserted here
 * is the ordering that matters — the middleware only ever sees a status the app already decided.
 */
const createApp = () => {
  const app = new Hono();
  app.use(notFoundMiddleware());
  app.get("/introduction", (context) => context.html("<h1>Introduction</h1>"));
  app.notFound((context) => context.html("<h1>Page not found</h1>", 404));
  return app;
};

describe("not-found middleware", () => {
  it("answers a missing page with a Markdown body when the client did not ask for HTML", async () => {
    const response = await createApp().request("/missing", { headers: { accept: "*/*" } });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    await expect(response.text()).resolves.toContain("# 404 Not Found");
  });

  it("names the requested path in the Markdown body", async () => {
    const response = await createApp().request("/guides/typo", { headers: { accept: "*/*" } });

    await expect(response.text()).resolves.toContain("`/guides/typo` is not a page");
  });

  it("leaves the HTML 404 alone for a browser", async () => {
    const response = await createApp().request("/missing", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("<h1>Page not found</h1>");
  });

  it("serves Markdown to a browser that asks for it outright", async () => {
    const response = await createApp().request("/missing", {
      headers: { accept: "text/markdown" },
    });

    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });

  it("does not touch a page that exists", async () => {
    const response = await createApp().request("/introduction", { headers: { accept: "*/*" } });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("<h1>Introduction</h1>");
  });

  it("leaves a missing static asset as the HTML 404 it already was", async () => {
    const response = await createApp().request("/missing.png", { headers: { accept: "image/*" } });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("leaves a redirect alone", async () => {
    const app = createApp();
    app.get("/old", (context) => context.redirect("/introduction", 308));

    const response = await app.request("/old", { headers: { accept: "*/*" } });

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/introduction");
  });
});
