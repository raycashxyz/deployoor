'use client';

import { useCallback, useState } from 'react';

export function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <button type="button" className="landing-command-row" onClick={copy}>
      <code>{code}</code>
      <span className="landing-command-action">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
