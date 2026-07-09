import { defineConfig } from "tsdown";

// Dual ESM + CJS: Hardhat configs are still commonly CommonJS (`require("@deployoor/hardhat")`),
// so the CJS build matters. `deployoor` (via `deployoor/generate`) and `hardhat` are peers —
// kept external so the plugin uses the consumer's copies, never bundled ones.
export default defineConfig({
  // `src/index.ts` = Hardhat 2 entry; `src/v3.ts` = Hardhat 3 plugin (`@deployoor/hardhat/v3`).
  // v3's compile action is a separate module it imports lazily (Hardhat forbids inline plugin
  // actions); rolldown code-splits it into its own chunk automatically.
  entry: ["src/index.ts", "src/v3.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  sourcemap: true,
  // Mark the peers external by their bare specifiers so rolldown preserves e.g. `hardhat/config`
  // verbatim. Otherwise it resolves against the installed Hardhat 2 (which has no `exports` map)
  // and emits the resolved file path `hardhat/config.js` — which Hardhat 3's strict `exports`
  // (only `./config`) then rejects. The bare specifier resolves under both majors.
  external: [/^hardhat(\/.*)?$/, /^deployoor(\/.*)?$/],
});
