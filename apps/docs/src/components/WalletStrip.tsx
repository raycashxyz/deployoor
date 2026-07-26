/**
 * "Works with any viem-compatible wallet" row, used on the landing page and in the docs
 * introduction.
 *
 * Each entry renders as a wordmark unless it has an `icon`, in which case the SVG at
 * `/icons/wallets/<icon>.svg` is masked with `currentColor` so it tracks the theme (the same
 * technique as the landing social links). Dropping a real logo in is therefore one field:
 * save the official SVG to that folder and set `icon`.
 *
 * Only add `icon` for logos we actually hold the vendor SVG for. A redrawn approximation of
 * someone's mark looks worse than their name set in our own type.
 */
type Wallet = { name: string; icon?: string };

const WALLETS: readonly Wallet[] = [
  { name: "Local key" },
  { name: "Encrypted keystore" },
  { name: "AWS KMS" },
  { name: "Google Cloud KMS" },
  { name: "Turnkey" },
  { name: "Privy" },
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
            {wallet.icon ? (
              <span
                className="wallet-strip-logo"
                style={{ maskImage: `url(/icons/wallets/${wallet.icon}.svg)` }}
                role="img"
                aria-label={wallet.name}
              />
            ) : (
              wallet.name
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
