// The consumption half of the journey: turn the committed `deployments/` records into typed
// contract access for an app. You write no addresses and paste no ABIs — @deployoor/wagmi reads
// the same JSON `scripts/deploy.ts` wrote, and @wagmi/cli generates from it.
//
//   pnpm --filter @example/hardhat wagmi
//
// Output: src/generated.ts (committed here so you can read it without running anything).
// It depends only on viem — not on deployoor.
import { defineConfig } from "@wagmi/cli";
import { actions } from "@wagmi/cli/plugins";
import { deployments } from "@deployoor/wagmi";

export default defineConfig({
  out: "src/generated.ts",
  // `react()` instead of `actions()` would emit hooks; both read the same records.
  plugins: [deployments({ path: "./deployments" }), actions()],
});
