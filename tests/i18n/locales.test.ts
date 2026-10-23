import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n/i18n';
import { messages } from '../../src/i18n/messages';
import { findUnsupportedSymbols } from '../../src/i18n/charset';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('locale files', () => {
  it('exist for zh-TW and en', () => {
    expect(Object.keys(messages).sort()).toEqual([...LOCALES].sort());
  });

  it('define the same keys in every locale', () => {
    const zh = Object.keys(messages['zh-TW']).sort();
    expect(Object.keys(messages.en).sort()).toEqual(zh);
  });

  it('have no empty strings and the same placeholders per key', () => {
    for (const [key, zh] of Object.entries(messages['zh-TW'])) {
      const en = (messages.en as Record<string, string>)[key]!;
      expect(zh.trim(), key).not.toBe('');
      expect(en.trim(), key).not.toBe('');
      expect(placeholders(en), key).toEqual(placeholders(zh));
    }
  });

  it('avoid symbols that neither font can draw (², ≈, ✓)', () => {
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(messages[locale])) {
        expect(findUnsupportedSymbols(text), `${locale} ${key}`).toEqual([]);
      }
    }
  });
});
