import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateDeployers } from "../../src/generate";
import { UnsupportedFramework } from "../../src/errors";

/**
 * A project whose deployoor.config.js names `framework` — plain JavaScript, evaluated at runtime, so
 * no type checker stands between a stale or mistyped value and the artifact reader.
 */
const projectWithFramework = (framework: string): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-framework-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "app", devDependencies: { deployoor: "*", viem: "^2" } }),
  );
  writeFileSync(
    join(root, "deployoor.config.js"),
    `export default { framework: ${JSON.stringify(framework)}, sources: "./src" };\n`,
  );
  writeFileSync(join(root, "Counter.sol"), "contract Counter {}");
  return root;
};

describe("a configured framework deployoor does not read", () => {
  it('rejects framework: "tevm" saying it was removed and how to migrate', async () => {
    const error = await generateDeployers({ root: projectWithFramework("tevm") }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnsupportedFramework);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain('The "tevm" framework was removed');
    expect(message).toContain("`sources` option");
    expect(message).toContain("npx hardhat compile");
    expect(message).toContain("forge build");
    // Not the detection error it used to fall through to, which blamed the project layout.
    expect(message).not.toContain("Could not tell what this project is built with");
  });

  it("rejects any other unknown value by quoting it back", async () => {
    const error = await generateDeployers({ root: projectWithFramework("truffle") }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnsupportedFramework);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain('Unsupported framework "truffle"');
    expect(message).toContain('framework: "hardhat"');
    expect(message).not.toContain("tevm");
  });
});
