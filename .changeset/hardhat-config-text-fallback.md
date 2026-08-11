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

The import is still tried first and still wins when it works, since it can resolve a computed path. When it fails, the file is now scanned for a literal `paths.artifacts` — and that scan refuses far more than it accepts, because a wrong answer sends deployoor at a directory the project does not compile into, which is a deploy of stale bytecode rather than a clean error. Comments are stripped first, so a commented-out `paths` block cannot win on position, and a second `paths:` key anywhere in the file (`networks: { local: { paths: … } }`) makes it ambiguous and the answer is refused outright. A computed value never matches either. All three cases need `artifactsPath`, and every refusal simply lands on the framework default.

Found by the new `examples/custom-paths`, which moves every path in the project and so hit this immediately.
