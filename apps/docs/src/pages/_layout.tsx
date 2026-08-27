import type { ReactNode } from "react";

import { structuredDataBlocks } from "../lib/site";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script defer src="/site-enhancements.js" />
      {/* Identity JSON-LD (Organization, SoftwareApplication, WebSite). Here rather than in Vocs'
          `head.script` config, which renders twice per page — see src/lib/site.ts. */}
      {structuredDataBlocks.map(({ id, json }) => (
        <script key={id} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}
      {children}
    </>
  );
}
