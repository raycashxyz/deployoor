import { defineConfig } from "tsdown";

// ESM only: this package is private and exists to be bundled into `@deployoor/testing`
// (which emits the dual build), and to be imported directly by `deployoor`'s tests.
// `viem` and `@nomicfoundation/edr` are peers — both consumers bring their own.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node22",
  sourcemap: true,
});
