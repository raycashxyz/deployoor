import { defineConfig } from "tsdown";

// Dual ESM + CJS: Hardhat configs are still commonly CommonJS (`require("@deployoor/hardhat")`),
// so the CJS build matters. `deployoor` (via `deployoor/generate`) and `hardhat` are peers —
// kept external so the plugin uses the consumer's copies, never bundled ones.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: true,
});
