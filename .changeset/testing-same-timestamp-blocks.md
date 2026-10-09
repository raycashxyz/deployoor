---
"@deployoor/testing": minor
---

Add `allowBlocksWithSameTimestamp` to `createTestClients()`. Off by default, as on a real chain. On, `evm_setNextBlockTimestamp` may pin the next block to the head's own timestamp, for a test that reads state at a deadline and must transact at that same second.
