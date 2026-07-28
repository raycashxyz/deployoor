# Vendored logos

Third-party marks used in the docs, with where each came from. All are vendored rather than
hotlinked, because several of these CDN URLs carry rotating signatures or content hashes.

Everything here is used descriptively, to name the tool or service a page is about. That is
nominative use. Do not reuse these under a heading like "our partners" or "trusted by", which
would imply an endorsement none of these companies has given.

## How they are rendered

Two sets, both drawn as **CSS masks filled with `currentColor`** (see the logo section of
`src/pages/_root.css`):

| Set                  | Where                                          | Sizing                                                               |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `tools/`, `wallets/` | Sidebar entries and page headings — icon marks | One uniform square slot, so every sidebar label starts at the same x |
| `wordmarks/`         | The homepage and introduction logo cloud       | One shared height, width per logo's measured aspect ratio            |

Because everything is a mask, **the fills inside these files are irrelevant** — only the alpha
matters. Each file is nonetheless normalised to `fill="currentColor"` so it also looks right if
inlined. This is a deliberate decision to render all logos in a single colour rather than in each
vendor's brand colours, which also removes any need for per-vendor light and dark variants.

Every `viewBox` is cropped to the artwork's own **ink bounds**, measured with `getBBox()` in a real
browser rather than eyeballed, so `mask-size: contain` fills the slot with no baked-in padding and
nothing is clipped. Re-measure after replacing any file; several vendor exports are wrong:

- Privy's wordmark ships a `0 0 438 48` viewBox whose artwork stops at x=214.59, so half the box is
  empty.
- Turnkey's wordmark has 4.5 units of empty space above the artwork.
- `tools/rocketh.svg` had artwork extending **outside** its own viewBox (ink `-1.34 -23.1 184.46
193.26` against a `0 0 164 164` box), so the top of the logo was being clipped.

## Tools

| File                | Source                                                                                        | Licence / notes                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tools/hardhat.svg` | [vscode-icons](https://github.com/vscode-icons/vscode-icons) `file-type-hardhat`, via iconify | MIT, author Roberto Huertas (attribution kept inside the file). Cropped to ink.             |
| `tools/rocketh.svg` | <https://rocketh.dev/logo.svg>                                                                | rocketh project asset. Inkscape editor metadata stripped, viewBox widened to stop clipping. |

Hardhat's mark covers both the Hardhat and Hardhat Ignition comparison pages.

## Wallets (icon marks)

| File                   | Source                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `wallets/privy.svg`    | The inline symbol from Privy's own site                                                                        |
| `wallets/turnkey.svg`  | The symbol path from Turnkey's own site, cropped to its bounds                                                 |
| `wallets/coinbase.svg` | <https://static-assets.coinbase.com/ui-infra/illustration/v1/pictogram/svg/light/coinbaseLogoNavigation-4.svg> |
| `wallets/openfort.svg` | The icon mark from Openfort's own site                                                                         |

## Wordmarks (logo cloud)

| File                     | Source                                                                         | Aspect |
| ------------------------ | ------------------------------------------------------------------------------ | ------ |
| `wordmarks/dotenv.svg`   | [simple-icons](https://github.com/simple-icons/simple-icons) `dotenv`, CC0-1.0 | 1.000  |
| `wordmarks/privy.svg`    | The inline wordmark from Privy's own site                                      | 4.471  |
| `wordmarks/turnkey.svg`  | The nav wordmark from Turnkey's own site                                       | 4.615  |
| `wordmarks/coinbase.svg` | <https://commons.wikimedia.org/wiki/File:Coinbase.svg>                         | 5.598  |
| `wordmarks/dfns.svg`     | <https://dfns.co/logotype.svg>                                                 | 3.887  |
| `wordmarks/openfort.svg` | The full lockup from Openfort's own site                                       | 5.452  |

The aspect column is what the `.wordmark-*` widths in `_root.css` are derived from. If you replace a
file, re-measure its ink box and update both.

Coinbase's `mintcdn.com` asset was tried first and rejected: the file served from their
developer-docs theme is the **Coinbase Developer Docs** lockup, not the corporate mark, and its URL
carries a signature that rotates when the asset changes.

## Not included

No authentic SVG was available for **AWS**, **Google Cloud**, **Fireblocks**, or **Ledger** at the
time these were added, so those are named in the `ALSO` line of
`src/components/WalletStrip.tsx` instead of shown as logos.

- AWS serves no corporate logo as a plain SVG URL, and its trademark guidelines license the
  "Powered by AWS" logo only to customers in good standing, revocably. The friendlier option is
  the **AWS KMS service icon** from the Architecture Icons package, which is explicitly cleared for
  use in whitepapers and presentations.
- Google Cloud's brand resource centre requires an approved application. The **Cloud KMS product
  icon** from their public legacy-icons zip is the equivalent friendlier option.
- Fireblocks publishes brand guidelines as a PDF inside a 26 MB zip, with no vector assets.
- Ledger's mark is on their site theme, but with no stated logo policy.

To add one: vendor the file under `wordmarks/`, measure its ink box, add a `.wordmark-*` rule with
that aspect ratio, and add the entry to `WORDMARKS` in `src/components/WalletStrip.tsx`.
