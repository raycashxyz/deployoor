import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager, installCommandLine, offerInstall } from "../../src/cli/install";

const projectWith = (lockfile?: string): string => {
  const root = mkdtempSync(join(tmpdir(), "deployoor-install-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "p" }));
  if (lockfile !== undefined) writeFileSync(join(root, lockfile), "");
  return root;
};

const interactive = { isInteractive: () => true };

describe("detectPackageManager", () => {
  it("reads the package manager from the lockfile", () => {
    expect(detectPackageManager(projectWith("pnpm-lock.yaml")).command).toBe("pnpm");
    expect(detectPackageManager(projectWith("yarn.lock")).command).toBe("yarn");
    expect(detectPackageManager(projectWith("bun.lockb")).command).toBe("bun");
    expect(detectPackageManager(projectWith("package-lock.json")).command).toBe("npm");
  });

  it("falls back to npm when there is no lockfile", () => {
    expect(installCommandLine(detectPackageManager(projectWith()), ["deployoor"])).toBe(
      "npm install -D deployoor",
    );
  });

  it("builds the add-as-dev-dependency line for the detected manager", () => {
    expect(
      installCommandLine(detectPackageManager(projectWith("pnpm-lock.yaml")), ["deployoor", "viem"]),
    ).toBe("pnpm add -D deployoor viem");
  });
});

describe("offerInstall", () => {
  it("installs after an explicit yes", async () => {
    const run = vi.fn().mockReturnValue(true);
    const installed = await offerInstall(projectWith("pnpm-lock.yaml"), ["deployoor", "viem"], {
      ...interactive,
      ask: async () => "y",
      run,
      log: () => {},
    });

    expect(installed).toBe(true);
    expect(run).toHaveBeenCalledWith({ command: "pnpm", args: ["add", "-D"] }, ["deployoor", "viem"]);
  });

  it("treats a bare Enter as no, and does not install", async () => {
    const run = vi.fn();
    const installed = await offerInstall(projectWith(), ["deployoor"], {
      ...interactive,
      ask: async () => "",
      run,
      log: () => {},
    });

    expect(installed).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not install on an unrecognised answer", async () => {
    const run = vi.fn();
    const installed = await offerInstall(projectWith(), ["deployoor"], {
      ...interactive,
      ask: async () => "sure",
      run,
      log: () => {},
    });

    expect(installed).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("never asks and never installs without a TTY, so CI cannot be prompted", async () => {
    const ask = vi.fn();
    const run = vi.fn();
    const installed = await offerInstall(projectWith(), ["deployoor"], {
      isInteractive: () => false,
      ask,
      run,
      log: () => {},
    });

    expect(installed).toBe(false);
    expect(ask).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("quotes the exact command in the question", async () => {
    const ask = vi.fn().mockResolvedValue("n");
    await offerInstall(projectWith("yarn.lock"), ["deployoor", "viem"], {
      ...interactive,
      ask,
      run: () => true,
      log: () => {},
    });

    expect(ask).toHaveBeenCalledWith("deployoor: run `yarn add -D deployoor viem` now? [y/N] ");
  });

  it("reports a failed install rather than claiming success", async () => {
    const log = vi.fn();
    const installed = await offerInstall(projectWith(), ["deployoor"], {
      ...interactive,
      ask: async () => "y",
      run: () => false,
      log,
    });

    expect(installed).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failed"));
  });
});
