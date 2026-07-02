import { defineConfig } from "@wagmi/cli";
import { deployments } from "@deployoor/wagmi";

// Consume the committed deployments/ records as typed contract objects — the "frontend"
// end of the journey. `wagmi generate` writes src/generated.ts (addresses + ABIs, per chain).
// Add `react()` or `actions()` from @wagmi/cli/plugins for hooks/actions.
export default defineConfig({
  out: "src/generated.ts",
  plugins: [deployments({ path: "./deployments" })],
});
