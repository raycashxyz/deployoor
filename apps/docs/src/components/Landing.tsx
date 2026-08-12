import { CopyBlock } from "./CopyBlock";
import { WalletStrip } from "./WalletStrip";
import { ProjectAnatomy } from "./ProjectAnatomy";
import { Link } from "vocs";

export const Landing = () => {
  return (
    <div className="landing">
      <div className="landing-hero">
        <img src="/og.png" alt="deployoor" className="landing-hero-img landing-hero-light" />
        <img src="/og-dark.png" alt="deployoor" className="landing-hero-img landing-hero-dark" />
      </div>

      <p className="landing-lead">
        Deploy contracts from <strong>TypeScript</strong>. Bring your own wallet: a deploy is an artifact plus
        a viem client, so your scripts, tests, and app share the same typed objects.
      </p>

      <div className="landing-hero-command">
        <CopyBlock code="npx deployoor generate" />
      </div>

      <WalletStrip />

      <ProjectAnatomy />

      <div className="landing-links">
        <Link to="/getting-started/installation" className="landing-cta">
          Read the docs
        </Link>
      </div>
      <nav className="landing-social-links" aria-label="Community links">
        <a
          href="https://t.me/deployoor"
          className="landing-social-link"
          data-social="telegram"
          aria-label="Telegram"
          title="Telegram"
          target="_blank"
          rel="noopener noreferrer"
        />
        <a
          href="https://github.com/raycashxyz/deployoor"
          className="landing-social-link"
          data-social="github"
          aria-label="GitHub"
          title="GitHub"
          target="_blank"
          rel="noopener noreferrer"
        />
        <a
          href="https://www.npmjs.com/package/deployoor"
          className="landing-social-link"
          data-social="npm"
          aria-label="npm"
          title="npm"
          target="_blank"
          rel="noopener noreferrer"
        />
      </nav>
    </div>
  );
};
