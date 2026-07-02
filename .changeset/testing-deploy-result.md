---
"@deployoor/testing": patch
---

Docs and tests updated for deployoor's new `getOrDeploy` return shape (`{ contract, freshDeploy, receipt, deployment }`): the README snippets and the `createTestClients` JSDoc example now destructure `const { contract: token } = await getOrDeployToken(...)`, and the seeded-record reuse test reads `result.contract` and asserts `freshDeploy: false`. No API or runtime change to `@deployoor/testing` itself.
