import { defineConfig } from "vitest/config";

// Self-contained (no @raycash/* extends) so the package stays extraction-ready.
// Conventions mirror the monorepo: BDD `it("does X when Y")`, third person, node env.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 10_000,
  },
});
