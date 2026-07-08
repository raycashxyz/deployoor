'use client';

import { useCallback, useMemo, useState } from 'react';

type PackageManager = 'pnpm' | 'yarn' | 'npm';
type Toolchain = 'foundry' | 'hardhat';

const INSTALL: Record<PackageManager, string> = {
  pnpm: 'pnpm add -D deployoor viem tsx',
  yarn: 'yarn add -D deployoor viem tsx',
  npm: 'npm install -D deployoor viem tsx',
};

const GENERATE: Record<Toolchain, string> = {
  foundry: 'forge build && npx deployoor generate',
  hardhat: 'npx hardhat compile && npx deployoor generate',
};

const INIT = 'npx deployoor init';

function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="landing-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          className={`landing-tab${active === tab ? ' landing-tab-active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function CopyBlock({ code }: { code: string }) {
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


export function Landing() {
  const [pkg, setPkg] = useState<PackageManager>('pnpm');
  const [toolchain, setToolchain] = useState<Toolchain>('foundry');

  const installCode = useMemo(() => INSTALL[pkg], [pkg]);
  const generateCode = useMemo(() => GENERATE[toolchain], [toolchain]);

  return (
    <div className="landing">
      <div className="landing-hero">
        <img src="/hero-light.png" alt="deployoor" className="landing-hero-img landing-hero-light" />
        <img src="/hero-dark.png" alt="deployoor" className="landing-hero-img landing-hero-dark" />
      </div>

      <p className="landing-lead">
        Simplify your team&apos;s <strong>chain ops</strong>. Deploy once — typed viem contract objects in
        apps, scripts, and tests.
      </p>

      <div className="landing-commands">
        <div className="landing-command">
          <span className="landing-command-label">Install</span>
          <TabBar tabs={['pnpm', 'yarn', 'npm'] as const} active={pkg} onChange={setPkg} />
          <CopyBlock code={installCode} />
        </div>

        <div className="landing-command">
          <span className="landing-command-label">Init</span>
          <CopyBlock code={INIT} />
        </div>

        <div className="landing-command">
          <span className="landing-command-label">Generate</span>
          <TabBar tabs={['foundry', 'hardhat'] as const} active={toolchain} onChange={setToolchain} />
          <CopyBlock code={generateCode} />
        </div>
      </div>

      <div className="landing-links">
        <a href="/getting-started/installation" className="landing-cta">
          Read the docs
        </a>
        <a
          href="https://github.com/raycashxyz/deployoor"
          className="landing-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a href="https://www.npmjs.com/package/deployoor" className="landing-link" target="_blank" rel="noopener noreferrer">
          npm
        </a>
      </div>
    </div>
  );
}
