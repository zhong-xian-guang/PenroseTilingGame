/**
 * Character-set helpers shared by the font build step (scripts/build-fonts.ts)
 * and the locale tests. Self-contained on purpose: Node runs this file directly
 * with type stripping, so it must not import anything.
 */

/**
 * Symbols missing from both LINE Seed Sans (EN) and LINE Seed TW. Using them in
 * interface text would fall back to a system font (write「平方單位」, or a CSS
 * superscript 2, instead of ²).
 */
export const UNSUPPORTED_SYMBOLS: readonly string[] = ['²', '≈', '✓'];

const ASCII_FIRST = 0x20;
const ASCII_LAST = 0x7e;

/** Sorted, unique code points of `texts`, plus printable ASCII; control characters are skipped. */
export function collectCharset(texts: Iterable<string>): number[] {
  const set = new Set<number>();
  for (let c = ASCII_FIRST; c <= ASCII_LAST; c++) set.add(c);
  for (const text of texts) {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
      set.add(cp);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** The unsupported symbols that occur in `text`, each once, in UNSUPPORTED_SYMBOLS order. */
export function findUnsupportedSymbols(text: string): string[] {
  return UNSUPPORTED_SYMBOLS.filter((s) => text.includes(s));
}

/** CSS `unicode-range` value for a set of code points, e.g. `U+41-43, U+61`. */
export function toUnicodeRange(codepoints: Iterable<number>): string {
  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const parts: string[] = [];
  const hex = (n: number) => n.toString(16).toUpperCase();
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(i === j ? `U+${hex(sorted[i]!)}` : `U+${hex(sorted[i]!)}-${hex(sorted[j]!)}`);
    i = j + 1;
  }
  return parts.join(', ');
}
