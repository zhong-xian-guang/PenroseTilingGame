import { describe, expect, it } from 'vitest';
import { translate, detectLocale } from '../../src/i18n/i18n';

describe('translate', () => {
  const messages = { 'hud.tiles': '片數', 'score.line': '{n} 片，面積 {area}' };

  it('returns the message for a key', () => {
    expect(translate(messages, 'hud.tiles')).toBe('片數');
  });

  it('fills named placeholders', () => {
    expect(translate(messages, 'score.line', { n: 12, area: '3.5' })).toBe('12 片，面積 3.5');
  });

  it('leaves unknown placeholders visible instead of dropping them', () => {
    expect(translate(messages, 'score.line', { n: 1 })).toBe('1 片，面積 {area}');
  });
});

describe('detectLocale', () => {
  it('prefers a saved choice', () => {
    expect(detectLocale('en', ['zh-TW'])).toBe('en');
  });

  it('ignores a saved value that is not a supported locale', () => {
    expect(detectLocale('fr', ['en-US'])).toBe('en');
  });

  it('maps any Chinese browser language to zh-TW', () => {
    expect(detectLocale(null, ['zh-HK', 'en'])).toBe('zh-TW');
    expect(detectLocale(null, ['zh-Hant-TW'])).toBe('zh-TW');
  });

  it('maps English browser languages to en', () => {
    expect(detectLocale(null, ['en-GB', 'zh-TW'])).toBe('en');
  });

  it('falls back to zh-TW when nothing matches', () => {
    expect(detectLocale(null, ['ja', 'fr'])).toBe('zh-TW');
    expect(detectLocale(null, [])).toBe('zh-TW');
  });
});
