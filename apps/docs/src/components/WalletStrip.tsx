/**
 * "Works with any viem-compatible wallet" logo cloud, used on the landing page and in the docs
 * introduction.
 *
 * Each entry is a vendor wordmark rendered as a CSS mask in `currentColor` (see `.wordmark-*` in
 * _root.css), so the whole row is one colour and reads as a set rather than as a pile of competing
 * brand palettes.
 *
 * Only add an entry once its real SVG is vendored under public/icons/wordmarks and its measured
 * aspect ratio has a `.wordmark-*` rule. Wallets we support but hold no logo for are named in
 * `ALSO`, and the full list lives in the recipes index.
 */
type Wordmark = { name: string; slug: string };

/** Exported so the landing page's deploy-script step can show the same row without a second list. */
export const WORDMARKS: readonly Wordmark[] = [
  { name: ".env", slug: "dotenv" },
  { name: "Privy", slug: "privy" },
  { name: "Turnkey", slug: "turnkey" },
  { name: "Coinbase", slug: "coinbase" },
  { name: "Dfns", slug: "dfns" },
  { name: "Openfort", slug: "openfort" },
];

const ALSO = "AWS KMS, Google Cloud KMS, Fireblocks, Ledger, or any EIP-1193 provider";

export const WalletStrip = ({ heading = "Works with any viem-compatible wallet" }: { heading?: string }) => {
  return (
    <section className="wallet-strip" aria-label={heading}>
      <p className="wallet-strip-heading">{heading}</p>
      <ul className="wallet-strip-list">
        {WORDMARKS.map((wordmark) => (
          <li key={wordmark.slug} className="wallet-strip-item">
            <span className={`wordmark wordmark-${wordmark.slug}`} role="img" aria-label={wordmark.name} />
          </li>
        ))}
      </ul>
      <p className="wallet-strip-also">also {ALSO}</p>
    </section>
  );
};
