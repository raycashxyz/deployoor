---
"deployoor": minor
---

Match generated relative imports to the project's TypeScript setup, so `deployers/` typechecks under `moduleResolution: node16`/`nodenext` (Hardhat 3's default) as well as `bundler`.

Those modes reject extensionless relative specifiers with TS2835, so a strict-ESM project could not `tsc` a deployoor project without loosening resolution. `deployoor generate` now reads the project's `tsconfig.json` (following `extends`) and emits `./types/Counter.js` only for the modes that require it — a `bundler`/tsx project keeps the extensionless form, since a `.js` specifier fails to resolve in setups that do not map it back to `.ts` (webpack without `resolve.extensionAlias`, ts-jest without a `moduleNameMapper`).

Override with the new `importExtension` config option: `'auto'` (default), `'none'`, or `'js'`.
