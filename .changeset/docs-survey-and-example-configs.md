---
"@deployoor/docs": patch
---

Bring the docs, READMEs and examples in line with 0.7, and add a custom-paths example

The examples' `deployers/` are now committed, and their `deployoor.config.ts` files are gone: all five set only `out` and `deploymentsPath` to the values that are already the defaults, so they demonstrated configuration nobody needs. `examples/custom-paths` is the one that does need a config, and shows exactly which paths require one.

Stale prose corrected: three example READMEs described the deployers as gitignored; two referred to a config file that no longer exists; the root README listed `deployoor verify` and bytecode-diff redeploy as Planned when both shipped; TODO.md said nothing reads the pinned sources back.
