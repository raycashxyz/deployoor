"use client";

import { useCallback, useState } from "react";
import { copyText } from "../lib/copy-text";

export const CopyBlock = ({ code, multiline = false }: { code: string; multiline?: boolean }) => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void copyText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard unavailable or denied — leave the button in its default state.
      });
  }, [code]);

  return (
    <button
      type="button"
      className={multiline ? "landing-command-row landing-command-multi" : "landing-command-row"}
      onClick={copy}
      data-copied={copied ? "true" : "false"}
    >
      <code>{code}</code>
      <span className="landing-command-action">{copied ? "✓ Copied" : "Copy"}</span>
    </button>
  );
};
