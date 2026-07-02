import "hardhat/types/config";

declare module "hardhat/types/config" {
  interface HardhatUserConfig {
    /** deployoor options. `generate` (default `true`): run `deployoor generate` after `hardhat compile`. */
    deployoor?: {
      readonly generate?: boolean;
    };
  }

  interface HardhatConfig {
    deployoor: {
      readonly generate: boolean;
    };
  }
}
