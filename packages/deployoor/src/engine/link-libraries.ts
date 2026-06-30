import { Effect } from "effect";
import { LibrariesUnlinked } from "../errors";
import type { Artifact, Libraries } from "../schemas";

/**
 * Substitute library addresses into a contract's creation bytecode.
 *
 * Each required library appears in the bytecode as a `__$<placeholder>$__`
 * marker (the placeholder is keyed by library name in `metadata.libraryPlaceholders`).
 * Fails with `LibrariesUnlinked` when any required library address is missing —
 * no partial linking, no thrown errors.
 */
export const linkLibraries = (
  artifact: Pick<Artifact, "name" | "bytecode" | "metadata">,
  libraries: Libraries = {},
): Effect.Effect<`0x${string}`, LibrariesUnlinked> =>
  Effect.gen(function* () {
    const placeholders = artifact.metadata.libraryPlaceholders;
    const required = Object.keys(placeholders);

    const missing = required.filter((name) => libraries[name] === undefined);
    if (missing.length > 0) {
      return yield* Effect.fail(new LibrariesUnlinked({ contract: artifact.name, missing }));
    }

    const linked = Object.entries(placeholders).reduce<string>((bytecode, [name, placeholder]) => {
      const address = libraries[name];
      if (address === undefined) return bytecode; // unreachable after the missing check
      const padded = address.slice(2).padStart(40, "0");
      return bytecode.split(`__$${placeholder}$__`).join(padded);
    }, artifact.bytecode);

    return linked as `0x${string}`;
  });
