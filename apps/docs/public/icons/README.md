# Vendored logos

Third-party marks used in the docs, with where each came from. All are vendored rather than
hotlinked, because several of these CDN URLs carry rotating signatures or content hashes.

Everything here is used descriptively, to name the tool or service a page is about. That is
nominative use. Do not reuse these under a heading like "our partners" or "trusted by", which
would imply an endorsement none of these companies has given.

## Tools

| File                | Source                                                                                        | Licence                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `tools/hardhat.svg` | [vscode-icons](https://github.com/vscode-icons/vscode-icons) `file-type-hardhat`, via iconify | MIT, author Roberto Huertas (attribution kept inside the file)              |
| `tools/rocketh.svg` | <https://rocketh.dev/logo.svg>                                                                | rocketh project asset. Inkscape editor metadata stripped; artwork unchanged |

## Wallets

| File                                                 | Source                                                                                                  | Licence / usage                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wallets/privy.svg`, `wallets/privy-white.svg`       | Official brand kit linked from <https://www.privy.io/brand-guidelines> (Wordmark black, Wordmark white) | Privy's guidelines **forbid altering the files**. Both variants ship as-is, and the dark theme swaps the asset instead of recolouring it. Never apply a filter to these.                                                                                                                 |
| `wallets/turnkey.svg`, `wallets/turnkey-white.svg`   | Official brand kit, <https://www.turnkey.com/turnkey-brand-kit> (Logo black, Logo white)                | No modification prohibition stated. Name is written "Turnkey". Keep clearspace around it.                                                                                                                                                                                                |
| `wallets/coinbase.svg`, `wallets/coinbase-white.svg` | [simple-icons](https://github.com/simple-icons/simple-icons) `coinbase`                                 | CC0-1.0, so modification is permitted. The `viewBox` is cropped to the glyph's ink box (`0 9.86 24 4.29`) because simple-icons centres the wordmark in a 24x24 square, which renders it tiny in a fixed-height slot. Fill set to Coinbase's `#0A0B0D` and to white for the dark variant. |

Coinbase's own `mintcdn.com` wordmark was tried first and rejected: the asset served from their
developer-docs theme is the **Coinbase Developer Docs** lockup, not the corporate wordmark, and
its URL carries a signature that rotates when the asset changes.

## Not included

No authentic SVG was available for **AWS**, **Google Cloud**, **Fireblocks**, or **Ledger** at the
time these were added, so those appear as plain text.

- AWS serves no corporate logo as a plain SVG URL, and its trademark guidelines license the
  "Powered by AWS" logo only to customers in good standing, revocably. The friendlier option is
  the **AWS KMS service icon** from the Architecture Icons package, which is explicitly cleared for
  use in whitepapers and presentations.
- Google Cloud's brand resource centre requires an approved application. The **Cloud KMS product
  icon** from their public legacy-icons zip is the equivalent friendlier option.
- Fireblocks publishes brand guidelines as a PDF inside a 26 MB zip, with no vector assets.
- Ledger's mark is on their site theme, but with no stated logo policy.

If you add any of these, put the file here, add a row above, and set `brand` on the entry in
`src/components/WalletStrip.tsx`.
