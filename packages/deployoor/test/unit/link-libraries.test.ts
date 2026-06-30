import { describe, it, expect } from "vitest";
import { Effect, Either } from "effect";
import { linkLibraries } from "../../src/engine/link-libraries";
import type { Artifact } from "../../src/schemas";

const placeholder = "f2b8c1a0d3e4f5061728394a5b6c7d8e9f";

const artifact = (): Pick<Artifact, "name" | "bytecode" | "metadata"> => ({
  name: "UsesLib",
  bytecode: `0x6080__$${placeholder}$__6080`,
  metadata: {
    fullyQualifiedName: "src/UsesLib.sol:UsesLib",
    compilerVersion: "0.8.27",
    standardJsonInput: { language: "Solidity", sources: {}, settings: {} },
    libraryPlaceholders: { MathLib: placeholder },
  },
});

describe("linkLibraries", () => {
  it("substitutes the library address and leaves no placeholder", () => {
    const address = `0x${"11".repeat(20)}` as const;

    const linked = Effect.runSync(linkLibraries(artifact(), { MathLib: address }));

    expect(linked).not.toContain("__$");
    expect(linked.toLowerCase()).toContain("11".repeat(20));
  });

  it("fails with LibrariesUnlinked listing the missing library", () => {
    const result = Effect.runSync(Effect.either(linkLibraries(artifact(), {})));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("LibrariesUnlinked");
      expect(result.left.missing).toEqual(["MathLib"]);
    }
  });

  it("returns bytecode unchanged when the contract needs no libraries", () => {
    const plain = {
      name: "Token",
      bytecode: "0x6080" as const,
      metadata: { ...artifact().metadata, libraryPlaceholders: {} },
    };

    const linked = Effect.runSync(linkLibraries(plain));

    expect(linked).toBe("0x6080");
  });
});
