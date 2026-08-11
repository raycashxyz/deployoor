---
"@deployoor/docs": patch
---

Rebuild the landing page around the project structure, and say that tests and deploys now need compiled artifacts.

The homepage leads with the command, then walks the eight files a project actually gains — each with its contents, and which are optional. Three claims in the draft were falsified by 0.7 and are corrected: a deployer no longer bakes in the artifact (only the abi, which is why it is committable), the record's field is `constructorArgs`, and the emit is two files per contract.

The testing guide never mentioned compiling, which 0.7 made load-bearing.
