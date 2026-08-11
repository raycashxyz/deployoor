---
"deployoor": patch
---

Read `paths.artifacts` from a hardhat.config that cannot be imported

deployoor finds a Hardhat project's artifacts by importing `hardhat.config.*` and reading `paths.artifacts`. A config that registers a plugin — `require("@deployoor/hardhat")`, or any of the plugins a real project uses — **cannot be imported outside a Hardhat run**: it throws `HH5: HardhatContext is not created`. That failure was treated as "no `paths.artifacts`", so deployoor fell back to the default `./artifacts`.

The result was a project with a moved artifacts directory being told to configure something deployoor was supposed to read for it — and, worse, failing at _deploy_ time while `generate` succeeded, because the Hardhat plugin hands the resolved path over directly while a deploy or a test has to read the config itself:

```text
No compiled artifacts in /repo/artifacts.

This is a Hardhat project (found hardhat.config.js), so deployoor looked in the default output
directory. …
```

The import is still tried first and still wins when it works, since it can resolve a computed path. When it fails, the value is read out of the config's source — structurally, not by pattern matching, because a wrong answer here points deployoor at a directory the project does not compile into, and if old artifacts happen to be there it is a silent deploy of stale bytecode rather than a clean error.

So the reader blanks comments and string contents (keeping offsets aligned, so a `{` inside a string cannot shift brace depth), locates the exported object, and requires `paths` to be a **direct** key of it and `artifacts` a **direct** key of that. A `paths` under `networks.local`, an `artifacts` nested inside `paths`, and a commented-out block are all at the wrong depth or not code, so none of them can win by appearing first. A computed value matches nothing.

Anything it cannot prove returns undefined and falls back to the framework default, with the error naming `artifactsPath`.

Found by the new `examples/custom-paths`, which moves every path in the project and so hit this immediately.
