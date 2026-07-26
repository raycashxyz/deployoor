/**
 * "Works with any viem-compatible wallet" row, used on the landing page and in the docs
 * introduction.
 *
 * An entry renders as its own name unless it has a `brand`, in which case the vendor's official
 * wordmark is shown via the `.brand-<name>` rules in _root.css, which swap the light and dark
 * files the vendor supplies rather than filtering one of them.
 *
 * Only set `brand` where we hold the vendor's real SVG. A redrawn approximation of someone's
 * mark looks worse than their name set in our own type, and several of these brands forbid
 * altering their artwork.
 */
type Wallet = { name: string; brand?: string };

const WALLETS: readonly Wallet[] = [
  { name: "Local key" },
  { name: "Encrypted keystore" },
  { name: "AWS KMS" },
  { name: "Google Cloud KMS" },
  { name: "Turnkey", brand: "turnkey" },
  { name: "Privy", brand: "privy" },
  { name: "Coinbase CDP", brand: "coinbase" },
  { name: "Fireblocks" },
  { name: "Ledger" },
];

export function WalletStrip({ heading = "Works with any viem-compatible wallet" }: { heading?: string }) {
  return (
    <section className="wallet-strip" aria-label={heading}>
      <p className="wallet-strip-heading">{heading}</p>
      <ul className="wallet-strip-list">
        {WALLETS.map((wallet) => (
          <li key={wallet.name} className="wallet-strip-item">
            {wallet.brand ? (
              <span className={`brand brand-${wallet.brand}`} role="img" aria-label={wallet.name} />
            ) : (
              wallet.name
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
