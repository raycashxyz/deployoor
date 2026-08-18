---
"@deployoor/blockscout": patch
"@deployoor/routescan": patch
---

Ship the built package. `0.1.0` went out without `dist/` — LICENSE, README, and `package.json` only — because a brand-new scoped package cannot be created over OIDC trusted publishing, and the one-shot bootstrap tarball was packed before the build. npm will not overwrite `0.1.0`. Install `0.1.1`.
