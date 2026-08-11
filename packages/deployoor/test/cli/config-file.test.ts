import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/cli/config-file";

/** Run `body` against a fresh temp project root, and remove it afterwards either way. */
const withRoot = async <T>(body: (root: string) => Promise<T>): Promise<T> => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-config-"));
  try {
    return await body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const writeConfig = (path: string, deploymentsPath: string): void =>
  writeFileSync(path, `export default { deploymentsPath: ${JSON.stringify(deploymentsPath)} };\n`);

describe("loadConfig", () => {
  it("discovers deployoor.config.ts in the root and evaluates it", async () =>
    withRoot(async (root) => {
      writeConfig(join(root, "deployoor.config.ts"), "./records");

      const { config, configPath } = await loadConfig(root);

      expect(configPath).toBe(join(root, "deployoor.config.ts"));
      expect(config.deploymentsPath).toBe("./records");
    }));

  it("returns the empty config when the project has none", async () =>
    withRoot(async (root) => {
      const { config, configPath } = await loadConfig(root);

      expect(config).toEqual({});
      expect(configPath).toBeUndefined();
    }));

  it("resolves a relative explicit path against root, not the working directory", async () =>
    withRoot(async (root) => {
      mkdirSync(join(root, "config"));
      writeConfig(join(root, "config", "custom.config.ts"), "./from-root");

      // process.cwd() is the package dir, where "config/custom.config.ts" does not exist — so this
      // only resolves if `root` is what the relative path is joined onto
      const { config, configPath } = await loadConfig(root, "config/custom.config.ts");

      expect(configPath).toBe(join(root, "config", "custom.config.ts"));
      expect(config.deploymentsPath).toBe("./from-root");
    }));

  it("keeps using an absolute explicit path unchanged", async () =>
    withRoot(async (elsewhere) =>
      withRoot(async (root) => {
        const absolute = join(elsewhere, "elsewhere.config.ts");
        writeConfig(absolute, "./absolute");

        const { config, configPath } = await loadConfig(root, absolute);

        expect(configPath).toBe(absolute);
        expect(config.deploymentsPath).toBe("./absolute");
      }),
    ));

  it("throws naming the resolved path when an explicit config does not exist", async () =>
    withRoot(async (root) => {
      await expect(loadConfig(root, "missing.config.ts")).rejects.toThrow(
        `no deployoor config at ${join(root, "missing.config.ts")}`,
      );
    }));
});
