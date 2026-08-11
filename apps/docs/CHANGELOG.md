# @deployoor/docs

## 0.0.1

### Patch Changes

- b9a41cb: Rebuild the landing page around the project structure, and say that tests and deploys now need compiled artifacts.

  The homepage leads with the command, then walks the eight files a project actually gains — each with its contents, and which are optional. Three claims in the draft were falsified by 0.7 and are corrected: a deployer no longer bakes in the artifact — it carries the contract's name, its fully-qualified name and its abi, and reads bytecode and compiler settings from `artifacts/` at deploy time, which is why it is committable — the record's field is `constructorArgs`, and the emit is more than one file per contract.

  The testing guide never mentioned compiling, which 0.7 made load-bearing for anything deploying through a **generated** deployer. A hand-built `TypedArtifact` is the exception: it is used as given and never sends deployoor to disk.
