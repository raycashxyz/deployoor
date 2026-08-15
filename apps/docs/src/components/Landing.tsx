import { CopyBlock } from "./CopyBlock";
import { WalletStrip } from "./WalletStrip";
import { ProjectAnatomy } from "./ProjectAnatomy";
import { Link } from "vocs";

/**
 * The landing narrates in an arc (the register is vercel.com/eve): claim → command → anchor
 * analogy → tour → closing invitation. The brand art carries the visible claim while the page's
 * one h1 stays screen-reader-only beside it, and the closing section mirrors the opening so the
 * tour lands on a next step instead of an exit.
 */
export const Landing = () => {
  return (
    <div className="landing">
      {/* The top nav is hidden on this layout, so this whisper-header is the only way out
          above the fold — without it the first link to the docs sat below nine steps. */}
      <header className="landing-topbar">
        <Link to="/" className="landing-topbar-brand">
          {/* The favicon pair, not the raw ink-cropped glyph — the D's thin notch falls
              apart at this size, and the favicon is the mark drawn for small rendering. */}
          <img
            src="/favicon.svg"
            alt=""
            width={600}
            height={600}
            className="landing-topbar-logo landing-logo-light"
          />
          <img
            src="/favicon-dark.svg"
            alt=""
            width={600}
            height={600}
            className="landing-topbar-logo landing-logo-dark"
          />
          deployoor
        </Link>
        <nav className="landing-topbar-nav" aria-label="Site">
          <Link to="/getting-started/installation">Docs</Link>
          <Link to="/changelog">Changelog</Link>
          <a href="https://github.com/raycashxyz/deployoor" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <section className="landing-hero">
        {/* The brand art carries the visible claim; the h1 stays for readers and crawlers
            the image can't reach. The four brighter dots over the art's matrix only exist
            in dark mode, where they twinkle. */}
        <h1 className="sr-only">Deploy contracts from TypeScript.</h1>
        <div className="landing-hero-visual">
          {/* The light art is the LCP element, so it gets the priority hint; the dark twin is
              lazy — display: none gives it no box in light mode, so it is never fetched there,
              while in dark mode it sits in the viewport and loads immediately anyway. */}
          <img
            src="/hero-light.webp"
            alt=""
            width={1200}
            height={630}
            fetchPriority="high"
            className="landing-logo-light"
          />
          <img
            src="/hero-dark.webp"
            alt=""
            width={1200}
            height={630}
            loading="lazy"
            className="landing-logo-dark"
          />
          <span className="landing-star" aria-hidden="true" />
          <span className="landing-star" aria-hidden="true" />
          <span className="landing-star" aria-hidden="true" />
          <span className="landing-star" aria-hidden="true" />
        </div>
        <p className="landing-lead">
          The missing deploy primitive for <strong>viem</strong>: bring your own wallet and clients, call one
          function, get a typed contract back — on every chain you ship to.
        </p>
        <div className="landing-hero-command">
          <CopyBlock code="npx deployoor generate" />
        </div>
        <p className="landing-compat">Hardhat v2 &amp; v3 · Foundry · plain Solidity (tevm)</p>
        <div className="landing-links landing-hero-links">
          <Link to="/getting-started/installation" className="landing-cta">
            Read the docs
          </Link>
        </div>
      </section>

      <WalletStrip />

      <ProjectAnatomy />

      <section className="landing-outro" aria-label="Get started">
        <p className="landing-outro-kicker hairline-label">two minutes to a typed deploy</p>
        <h2 className="landing-outro-title">Deploy your first contract.</h2>
        <div className="landing-outro-command">
          <CopyBlock
            multiline
            code={
              "pnpm add -D deployoor viem\nforge build   # or: npx hardhat compile\nnpx deployoor generate"
            }
          />
        </div>
        <div className="landing-links">
          <Link to="/getting-started/quickstart" className="landing-cta">
            Get started
          </Link>
          <Link to="/comparison" className="landing-ghost-link">
            {/* The span carries the underline, not the anchor — same reason as
                .anatomy-step-link: decoration would otherwise cross the gap and the arrow. */}
            <span>How it compares</span>
          </Link>
        </div>
      </section>

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
      <footer className="landing-colophon">
        <span>MIT license</span>
        <span>deploy once · reuse forever</span>
      </footer>
    </div>
  );
};
