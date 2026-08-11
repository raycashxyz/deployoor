/**
 * A tiny syntax highlighter for the short TS / Solidity / JSON snippets on the landing page.
 *
 * Vocs highlights MDX code fences with shiki at build time, but the landing page's snippets live
 * inside a React component that swaps them as you scroll, so they never pass through that pipeline.
 * shiki at runtime would mean shipping grammars + a theme to the browser for eight snippets that are
 * a few lines each, so this tokenises with one regex instead: no dependency, no async, and it runs
 * during prerender as happily as in the browser.
 *
 * It is deliberately approximate — enough structure to read as code, not a parser. Colours live in
 * `_root.css` (`.tok-*`), one palette per theme.
 */

export type TokenKind = "comment" | "string" | "keyword" | "number" | "fn" | "property" | "plain";

export type Token = { text: string; kind: TokenKind };

const KEYWORDS = new Set([
  // TypeScript
  "import",
  "export",
  "from",
  "default",
  "const",
  "type",
  "await",
  "async",
  "return",
  "if",
  "else",
  "new",
  "function",
  "class",
  "interface",
  "as",
  "void",
  "typeof",
  "true",
  "false",
  "null",
  "undefined",
  // Solidity
  "contract",
  "constructor",
  "public",
  "external",
  "internal",
  "private",
  "view",
  "pure",
  "payable",
  "returns",
  "memory",
  "storage",
  "event",
  "emit",
  "require",
  "uint",
  "uint256",
  "address",
  "bool",
  "string",
  "mapping",
]);

/**
 * Order matters: earlier alternatives win. `jsonKey` precedes `string` so a quoted JSON key is not
 * swallowed as a plain string, and `fn` precedes `word` so `defineConfig(` reads as a call.
 */
const PATTERN = new RegExp(
  [
    // `#` covers the shell snippets. Safe alongside TS here because none of these snippets use
    // private class fields, and without it a word like `contract` inside a shell comment gets
    // coloured as a Solidity keyword.
    "(?<comment>//[^\\n]*|#[^\\n]*|/\\*[\\s\\S]*?\\*/)",
    '(?<jsonKey>"(?:[^"\\\\]|\\\\.)*"(?=\\s*:))',
    "(?<string>\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
    "(?<property>[A-Za-z_$][\\w$]*(?=\\s*:))",
    "(?<fn>[A-Za-z_$][\\w$]*(?=\\s*\\())",
    "(?<number>\\b\\d[\\w.]*n?\\b)",
    "(?<word>[A-Za-z_$][\\w$]*)",
  ].join("|"),
  "g",
);

const kindOf = (groups: Record<string, string | undefined>): TokenKind => {
  if (groups.comment !== undefined) return "comment";
  if (groups.jsonKey !== undefined) return "property";
  if (groups.string !== undefined) return "string";
  if (groups.property !== undefined) return "property";
  if (groups.fn !== undefined) return "fn";
  if (groups.number !== undefined) return "number";
  if (groups.word !== undefined) return KEYWORDS.has(groups.word) ? "keyword" : "plain";
  return "plain";
};

/** Split `code` into coloured tokens, with the gaps between matches kept as `plain`. */
export const tokenize = (code: string): readonly Token[] => {
  const matches = [...code.matchAll(PATTERN)];

  const scanned = matches.reduce<{ tokens: readonly Token[]; cursor: number }>(
    (acc, match) => {
      const start = match.index ?? acc.cursor;
      const gap: readonly Token[] =
        start > acc.cursor ? [{ text: code.slice(acc.cursor, start), kind: "plain" }] : [];

      return {
        tokens: [...acc.tokens, ...gap, { text: match[0], kind: kindOf(match.groups ?? {}) }],
        cursor: start + match[0].length,
      };
    },
    { tokens: [], cursor: 0 },
  );

  const tail: readonly Token[] =
    scanned.cursor < code.length ? [{ text: code.slice(scanned.cursor), kind: "plain" }] : [];

  return [...scanned.tokens, ...tail];
};
