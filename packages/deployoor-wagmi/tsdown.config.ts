import { defineConfig } from "tsdown";

// Dual ESM + CJS, mirroring deployoor itself. abitype/zod stay external; @wagmi/cli is a
// peer (types only — we never import its runtime).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: true,
});
