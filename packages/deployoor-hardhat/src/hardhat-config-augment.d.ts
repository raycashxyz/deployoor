// Module augmentation adding Hardhat 3's `overrideTask` to `hardhat/config`. Hardhat 2 (the
// devDependency) already ships `hardhat/config` (with the `task` / `extendConfig` the default
// entry uses) but not `overrideTask`. The `export {}` makes this a *module*, so the declaration
// MERGES with the real `hardhat/config` types instead of replacing them — the default entry keeps
// its Hardhat 2 exports, and the `./v3` entry gains `overrideTask`. At runtime resolution uses the
// consumer's own hardhat (peer `^2 || ^3`).
export {};

declare module "hardhat/config" {
  type Hardhat3OverrideAction = (
    taskArguments: Record<string, unknown>,
    hre: { readonly config: { readonly paths: { readonly root: string } } },
    runSuper: (taskArguments: Record<string, unknown>) => Promise<unknown>,
  ) => unknown;

  interface Hardhat3TaskOverrideBuilder {
    setAction(action: () => Promise<{ default: Hardhat3OverrideAction }>): Hardhat3TaskOverrideBuilder;
    build(): unknown;
  }

  export function overrideTask(id: string): Hardhat3TaskOverrideBuilder;
}
