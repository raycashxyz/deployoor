import { defineConfig } from "tsdown";

// Dual ESM + CJS. `viem` is a peer and `@nomicfoundation/edr` a real dependency, both
// external. `@deployoor/evm` is private to this monorepo and is therefore *inlined*:
// it is never published, so a consumer could not resolve it as a dependency.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node22",
  sourcemap: true,
  noExternal: ["@deployoor/evm"],
});
