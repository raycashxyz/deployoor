import { defineConfig } from "tsdown";

// Dual ESM + CJS. deployoor (via deployoor/plugin) and viem are peers — kept external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: true,
});
