---
"@deployoor/testing": patch
---

Declare `zod` as a dependency. `@deployoor/testing` reaches zod v4 APIs (`treeifyError`) when validating deployment records, but did not declare zod — so under a hoisted node-linker a consumer's zod v3 could shadow it and crash at import ("does not provide an export named 'treeifyError'"). Pinned to `^4.4.3`, matching the other deployoor packages.
