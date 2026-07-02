---
"@deployoor/hardhat": minor
---

New package `@deployoor/hardhat`: a Hardhat plugin that regenerates deployoor's typed deployers automatically after every `hardhat compile`, in process — no separate `deployoor generate` step, no extra terminal. Add `import "@deployoor/hardhat"` (or `require("@deployoor/hardhat")`) to your Hardhat config; opt out with `deployoor: { generate: false }`. A generation failure is reported but never breaks `hardhat compile`.
