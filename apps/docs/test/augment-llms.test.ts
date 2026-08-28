import { describe, expect, it } from "vitest";

import { augmentLlmsFullTxt, augmentLlmsTxt, resolveOutputRoots } from "../scripts/augment-llms.mjs";
import { siteUrl } from "../src/lib/site";

const generatedShort = `# deployoor

Deploy EVM contracts from TypeScript with your own viem wallet.

- [Introduction](/introduction)
- [Installation](/getting-started/installation)
- [Changelog](/changelog): Release history for deployoor and its ecosystem packages.
`;

const generatedFull = `# deployoor

Deploy EVM contracts from TypeScript with your own viem wallet.

<!--
Sitemap:
- [Introduction](/introduction)
-->

# Introduction

Page body.
`;

describe("augmentLlmsTxt", () => {
  const augmented = augmentLlmsTxt(generatedShort) as string;

  it("keeps the generated title and description at the top", () => {
    expect(augmented.startsWith("# deployoor\n\nDeploy EVM contracts")).toBe(true);
  });

  it("adds when-to-use guidance before the page list", () => {
    expect(augmented.indexOf("## When to use deployoor")).toBeLessThan(augmented.indexOf("## Documentation"));
  });

  it("names the jobs deployoor is for, and the ones it is not", () => {
    expect(augmented).toContain("Reach for it to:");
    expect(augmented).toContain("Look elsewhere to compile or test Solidity");
  });

  it("tells an agent how to call it", () => {
    expect(augmented).toContain("npx deployoor generate");
    expect(augmented).toContain(`${siteUrl}/AGENTS.md`);
  });

  it("keeps every generated page link, under a section heading", () => {
    expect(augmented).toContain("## Documentation\n\n- [Introduction](/introduction)");
    expect(augmented).toContain("- [Installation](/getting-started/installation)");
    expect(augmented).toContain(
      "- [Changelog](/changelog): Release history for deployoor and its ecosystem packages.",
    );
  });

  it("ends with the developer resources, at absolute URLs", () => {
    expect(augmented).toContain("## Developer resources");
    expect(augmented).toContain(`${siteUrl}/reference/cli`);
    expect(augmented).toContain(`${siteUrl}/llms-full.txt`);
    expect(augmented.indexOf("## Developer resources")).toBeGreaterThan(
      augmented.indexOf("## Documentation"),
    );
  });

  it("writes every deployoor.dev link on the canonical origin, so none of them redirect", () => {
    const origins = [...augmented.matchAll(/https:\/\/[^/)\s]*deployoor\.dev/g)].map(([origin]) => origin);

    expect(origins.length).toBeGreaterThan(0);
    expect([...new Set(origins)]).toEqual([siteUrl]);
  });

  it("leaves an already-augmented file untouched", () => {
    expect(augmentLlmsTxt(augmented)).toBe(augmented);
  });

  it("leaves a file with no page list alone rather than guessing", () => {
    const headOnly = "# deployoor\n\nJust a description.\n";
    expect(augmentLlmsTxt(headOnly)).toBe(headOnly);
  });
});

describe("augmentLlmsFullTxt", () => {
  const augmented = augmentLlmsFullTxt(generatedFull) as string;

  it("inserts the guidance between the description and the generated body", () => {
    const guidance = augmented.indexOf("## When to use deployoor");

    expect(guidance).toBeGreaterThan(augmented.indexOf("Deploy EVM contracts"));
    expect(guidance).toBeLessThan(augmented.indexOf("<!--"));
  });

  it("keeps the sitemap comment and the page bodies", () => {
    expect(augmented).toContain("Sitemap:");
    expect(augmented).toContain("Page body.");
  });

  it("adds no page list of its own, since the bodies follow", () => {
    expect(augmented).not.toContain("## Documentation");
    expect(augmented).not.toContain("## Developer resources");
  });

  it("leaves an already-augmented file untouched", () => {
    expect(augmentLlmsFullTxt(augmented)).toBe(augmented);
  });
});

describe("resolveOutputRoots", () => {
  const roots = ["dist/public", ".vercel/output/static"];

  it("writes the Vercel copy too, since the enhancer copies dist before this runs", () => {
    expect(resolveOutputRoots(roots, () => true)).toEqual(roots);
  });

  it("skips the Vercel tree on a plain local build", () => {
    expect(resolveOutputRoots(roots, (root: string) => root === "dist/public")).toEqual(["dist/public"]);
  });

  it("finds nothing when there is no build output, so the caller can fail loudly", () => {
    expect(resolveOutputRoots(roots, () => false)).toEqual([]);
  });
});
