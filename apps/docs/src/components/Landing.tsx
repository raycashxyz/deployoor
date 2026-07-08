import { CopyBlock } from "./CopyBlock";

type TabOption = {
  id: string;
  label: string;
  code: string;
};

function TabbedCommands({ name, label, options }: { name: string; label: string; options: TabOption[] }) {
  return (
    <div className="landing-command">
      <span className="landing-command-label">{label}</span>
      <div className="landing-tabgroup">
        {options.map((option, index) => (
          <input
            key={option.id}
            type="radio"
            name={name}
            id={option.id}
            className="landing-tab-input"
            defaultChecked={index === 0}
          />
        ))}
        <div className="landing-tabs" role="tablist" aria-label={label}>
          {options.map((option, index) => (
            <label
              key={option.id}
              htmlFor={option.id}
              className="landing-tab"
              role="tab"
              id={`tab-${option.id}`}
              aria-controls={`panel-${option.id}`}
              aria-selected={index === 0 ? "true" : "false"}
            >
              {option.label}
            </label>
          ))}
        </div>
        {options.map((option) => (
          <div
            key={option.id}
            className="landing-tab-panel"
            id={`panel-${option.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${option.id}`}
          >
            <CopyBlock code={option.code} />
          </div>
        ))}
      </div>
    </div>
  );
}

const INSTALL_OPTIONS: TabOption[] = [
  { id: "install-pnpm", label: "pnpm", code: "pnpm add -D deployoor viem" },
  { id: "install-yarn", label: "yarn", code: "yarn add -D deployoor viem" },
  { id: "install-npm", label: "npm", code: "npm install -D deployoor viem" },
];

const GENERATE_OPTIONS: TabOption[] = [
  { id: "generate-foundry", label: "foundry", code: "forge build && npx deployoor generate" },
  { id: "generate-hardhat", label: "hardhat", code: "npx hardhat compile && npx deployoor generate" },
];

export function Landing() {
  return (
    <div className="landing">
      <div className="landing-hero">
        <img src="/og.png" alt="deployoor" className="landing-hero-img landing-hero-light" />
        <img src="/og-dark.png" alt="deployoor" className="landing-hero-img landing-hero-dark" />
      </div>

      <p className="landing-lead">
        Simplify your team&apos;s <strong>chain ops</strong>. Deploy once — typed viem contract objects in
        apps, scripts, and tests.
      </p>

      <div className="landing-commands">
        <TabbedCommands name="install" label="Install" options={INSTALL_OPTIONS} />
        <div className="landing-command">
          <span className="landing-command-label">Init</span>
          <CopyBlock code="npx deployoor init" />
        </div>
        <TabbedCommands name="generate" label="Generate" options={GENERATE_OPTIONS} />
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
        <a
          href="https://www.npmjs.com/package/deployoor"
          className="landing-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          npm
        </a>
      </div>
    </div>
  );
}
