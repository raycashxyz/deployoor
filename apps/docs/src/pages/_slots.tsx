"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const NPM_URL = "https://www.npmjs.com/package/deployoor";

export const Footer = undefined;
export const OutlineFooter = undefined;

function NpmSocialLink() {
  const [socialsTarget, setSocialsTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSocialsTarget(document.querySelector<HTMLElement>("[data-v-sidebar-footer-content] [data-v-socials]"));
  }, []);

  if (!socialsTarget) return null;

  return createPortal(
    <>
      <span className="deployoor-sidebar-social-separator" aria-hidden="true" />
      <a
        href={NPM_URL}
        className="deployoor-sidebar-npm"
        aria-label="npm"
        title="npm"
        target="_blank"
        rel="noopener noreferrer"
      />
    </>,
    socialsTarget,
  );
}

export function SidebarHeader() {
  return <NpmSocialLink />;
}
