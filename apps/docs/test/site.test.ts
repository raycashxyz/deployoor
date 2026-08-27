import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  contactEmail,
  npmUrl,
  publisherUrl,
  repoUrl,
  siteDescription,
  siteUrl,
  structuredDataBlocks,
} from "../src/lib/site";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type JsonLd = Record<string, unknown> & { "@type": string; "@id": string };

const entities: JsonLd[] = structuredDataBlocks.map(({ json }) => JSON.parse(json));

const byType = (type: string) => {
  const entity = entities.find((candidate) => candidate["@type"] === type);
  if (!entity) throw new Error(`no ${type} block in structuredDataBlocks`);
  return entity;
};

describe("structuredDataBlocks", () => {
  it("keys every block by the entity it describes, so a render can list them", () => {
    const ids = structuredDataBlocks.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(entities.map((entity) => entity["@id"]));
  });

  it("emits an identity type an agent can parse without walking a graph", () => {
    expect(entities.map((entity) => entity["@type"])).toEqual([
      "Organization",
      "SoftwareApplication",
      "WebSite",
    ]);
  });

  it("puts every block in the schema.org context", () => {
    entities.forEach((entity) => {
      expect(entity["@context"]).toBe("https://schema.org");
    });
  });

  it("serializes without characters that would break out of a script tag", () => {
    structuredDataBlocks.forEach(({ json }) => {
      expect(json).not.toContain("</");
      expect(json).not.toContain("<!--");
    });
  });
});

describe("Organization", () => {
  const organization = byType("Organization");

  it("identifies the publisher by name and canonical URL", () => {
    expect(organization.name).toBe("deployoor");
    expect(organization.url).toBe(siteUrl);
  });

  it("carries a contact point with a contact type and a reachable channel", () => {
    const contactPoints = organization.contactPoint as { contactType: string; url: string }[];

    expect(contactPoints.length).toBeGreaterThan(0);
    contactPoints.forEach((contactPoint) => {
      expect(contactPoint.contactType).toBeTruthy();
      expect(contactPoint.url).toMatch(/^https:\/\//);
    });
    expect(contactPoints.map(({ contactType }) => contactType)).toContain("technical support");
  });

  it("links the profiles that carry the same brand", () => {
    expect(organization.sameAs).toEqual(expect.arrayContaining([repoUrl, npmUrl, publisherUrl]));
  });

  it("publishes a reachable email, on the organization and on the support contact point", () => {
    const contactPoints = organization.contactPoint as { contactType: string; email?: string }[];
    const support = contactPoints.find(({ contactType }) => contactType === "technical support");

    expect(organization.email).toBe(contactEmail);
    expect(support?.email).toBe(contactEmail);
    expect(contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  });

  it("names the parent organization that actually publishes it", () => {
    expect(organization.parentOrganization).toEqual({
      "@type": "Organization",
      name: "Raycash",
      url: publisherUrl,
    });
  });

  it("names a logo with dimensions, so a consumer can render it", () => {
    expect(organization.logo).toMatchObject({
      "@type": "ImageObject",
      url: `${siteUrl}/icon-512.png`,
      width: 512,
      height: 512,
    });
  });
});

describe("SoftwareApplication", () => {
  const software = byType("SoftwareApplication");

  it("describes the product, priced and categorised", () => {
    expect(software.name).toBe("deployoor");
    expect(software.applicationCategory).toBe("DeveloperApplication");
    expect(software.description).toBe(siteDescription);
    expect(software.offers).toMatchObject({ "@type": "Offer", price: "0" });
    expect(software.isAccessibleForFree).toBe(true);
  });

  it("distinguishes the name from the spellings it gets corrected to", () => {
    const disambiguation = software.disambiguatingDescription as string;

    expect(disambiguation).toContain("double o");
    expect(disambiguation).toContain("Deployer");
  });

  it("says where to get it and under what licence", () => {
    expect(software.downloadUrl).toBe(npmUrl);
    expect(software.license).toContain("MIT");
  });

  it("credits the Organization by reference rather than repeating it", () => {
    expect(software.author).toEqual({ "@id": byType("Organization")["@id"] });
    expect(software.publisher).toEqual({ "@id": byType("Organization")["@id"] });
  });
});

describe("WebSite", () => {
  const website = byType("WebSite");

  it("ties the site to its publisher and its subject", () => {
    expect(website.url).toBe(siteUrl);
    expect(website.publisher).toEqual({ "@id": byType("Organization")["@id"] });
    expect(website.about).toEqual({ "@id": byType("SoftwareApplication")["@id"] });
  });
});

describe("site constants", () => {
  it("uses the apex, which is the host www redirects to", () => {
    expect(siteUrl).toBe("https://deployoor.dev");
  });

  it("anchors every @id on that host", () => {
    entities.forEach((entity) => {
      expect(entity["@id"].startsWith(siteUrl)).toBe(true);
    });
  });
});

describe("contact page", () => {
  const contactPage = readFileSync(path.join(docsRoot, "src/pages/contact.mdx"), "utf-8");

  it("shows the same address the schema publishes", () => {
    expect(contactPage).toContain(contactEmail);
  });

  it("routes vulnerabilities somewhere private", () => {
    expect(contactPage).toContain("security/advisories/new");
    expect(contactPage).toContain("do not describe it in a public issue");
  });
});
