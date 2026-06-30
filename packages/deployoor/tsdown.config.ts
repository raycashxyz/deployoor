import { defineConfig } from "tsdown";

// Rolldown-powered library bundler (the voidzero-ecosystem equivalent of tsup).
// Dual ESM + CJS so the package runs in as many Node environments as possible;
// bundling internal modules removes the extensionless-import problem; effect/zod/
// viem/abitype stay external.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/plugin-sdk.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: true,
});
