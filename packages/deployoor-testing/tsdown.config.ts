import { defineConfig } from "tsdown";

// Dual ESM + CJS. `viem` is a peer (external — use the consumer's copy); `tevm` is a
// real dependency, kept external and resolved at install.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: true,
});
