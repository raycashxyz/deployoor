// Ambient declaration of `hardhat/types/plugins`, which Hardhat 2 (this package's devDependency)
// does not ship but Hardhat 3 does. It lets the `./v3` entry type its default export as
// `HardhatPlugin`; the emitted `.d.ts` references this module specifier, so a Hardhat 3 consumer
// resolves the real type. This file has NO top-level import/export on purpose — that makes it an
// ambient script that *declares* the otherwise-missing module (a module-context file would try to
// *augment* it and error, since the module isn't present under Hardhat 2).
declare module "hardhat/types/plugins" {
  export interface HardhatPlugin {
    readonly id: string;
    readonly tasks?: readonly unknown[];
    readonly hookHandlers?: unknown;
    readonly globalOptions?: readonly unknown[];
    readonly dependencies?: () => unknown;
    readonly npmPackage?: string;
  }
}
