import { describe, expect, it } from 'vitest';
import { collectCharset, findUnsupportedSymbols, toUnicodeRange } from '../../src/i18n/charset';

describe('collectCharset', () => {
  it('always includes printable ASCII, for numbers and text built at runtime', () => {
    const set = collectCharset([]);
    expect(set[0]).toBe(0x20);
    expect(set.at(-1)).toBe(0x7e);
    expect(set).toHaveLength(0x7e - 0x20 + 1);
  });

  it('adds every character of the given texts once, sorted by code point', () => {
    const set = collectCharset(['面積 · 面', '片數']);
    const extra = set.filter((c) => c > 0x7e);
    expect(extra).toEqual([0xb7, 0x7247, 0x6578, 0x7a4d, 0x9762].sort((a, b) => a - b));
  });

  it('skips control characters such as newlines and tabs', () => {
    const set = collectCharset(['a\nb\tc\r']);
    expect(set.some((c) => c < 0x20)).toBe(false);
  });

  it('handles characters outside the BMP as single code points', () => {
    expect(collectCharset(['𠀀'])).toContain(0x20000);
  });
});

describe('findUnsupportedSymbols', () => {
  it('reports symbols that neither LINE Seed Sans nor LINE Seed TW has', () => {
    expect(findUnsupportedSymbols('面積 12 單位² ≈ 3 ✓')).toEqual(['²', '≈', '✓']);
  });

  it('reports each symbol once', () => {
    expect(findUnsupportedSymbols('² ²')).toEqual(['²']);
  });

  it('accepts text that both fonts can draw', () => {
    expect(findUnsupportedSymbols('面積 12 平方單位 × φ → π')).toEqual([]);
  });
});

describe('toUnicodeRange', () => {
  it('collapses consecutive code points into CSS ranges', () => {
    expect(toUnicodeRange([0x41, 0x42, 0x43, 0x61, 0x4e00])).toBe('U+41-43, U+61, U+4E00');
  });

  it('sorts and deduplicates first', () => {
    expect(toUnicodeRange([0x62, 0x61, 0x61])).toBe('U+61-62');
  });
});
