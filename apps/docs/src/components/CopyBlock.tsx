"use client";

import { useCallback, useState } from "react";
import { copyText } from "../lib/copy-text";

export function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void copyText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <button type="button" className="landing-command-row" onClick={copy}>
      <code>{code}</code>
      <span className="landing-command-action">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
