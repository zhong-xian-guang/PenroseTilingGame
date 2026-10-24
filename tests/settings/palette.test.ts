import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  contrastRatio,
  derivePalette,
  matchPreset,
  normalizeSettings,
} from '../../src/settings/palette';

const HEX = /^#[0-9a-f]{6}$/;

/** Euclidean RGB distance, to check two colours do not look alike. */
const rgbDistance = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
};

describe('contrastRatio (WCAG 2)', () => {
  it('matches the known values for black, white and identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 example
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('presets', () => {
  it('offer several distinct colour sets, the first being the default', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESETS[0]!.colors).toEqual(DEFAULT_SETTINGS.colors);
    for (const p of PRESETS) {
      for (const c of Object.values(p.colors)) expect(c).toMatch(HEX);
    }
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: tiles and background are distinguishable', (_, p) => {
    expect(rgbDistance(p.colors.kite, p.colors.dart)).toBeGreaterThan(60);
    const palette = derivePalette(p.colors);
    expect(contrastRatio(palette.outline, p.colors.kite)).toBeGreaterThanOrEqual(2);
    expect(contrastRatio(palette.outline, p.colors.dart)).toBeGreaterThanOrEqual(2);
  });
});

describe('derivePalette', () => {
  it('passes the chosen colours through and returns valid hex for any input', () => {
    const colors = { kite: '#000000', dart: '#ffffff', background: '#808080' };
    const palette = derivePalette(colors);
    expect(palette.background).toBe('#808080');
    expect(palette.tiles).toEqual({ kite: '#000000', dart: '#ffffff' });
    expect(palette.outline).toMatch(HEX);
  });

  it('is deterministic', () => {
    const colors = { kite: '#123456', dart: '#abcdef', background: '#fafafa' };
    expect(derivePalette(colors)).toEqual(derivePalette(colors));
  });
});

describe('normalizeSettings (reading saved settings)', () => {
  it('returns the defaults for missing or garbage data', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ colors: 5 })).toEqual(DEFAULT_SETTINGS);
  });

  it('drops the showArcs flag that settings saved by older versions still carry', () => {
    expect(normalizeSettings({ colors: PRESETS[1]!.colors, showArcs: false })).toEqual({ colors: PRESETS[1]!.colors });
  });

  it('keeps valid fields and replaces only invalid ones', () => {
    const s = normalizeSettings({
      colors: { kite: '#ABCDEF', dart: 'red', background: '#112233' },
    });
    expect(s).toEqual({
      colors: { kite: '#abcdef', dart: DEFAULT_SETTINGS.colors.dart, background: '#112233' },
    });
  });

  it('expands three-digit hex', () => {
    expect(normalizeSettings({ colors: { kite: '#fA0' } }).colors.kite).toBe('#ffaa00');
  });
});

describe('matchPreset', () => {
  it('names the preset whose colours are in use, or null for custom colours', () => {
    const night = PRESETS[1]!;
    expect(matchPreset({ ...night.colors })).toBe(night.id);
    expect(matchPreset({ ...night.colors, kite: '#010203' })).toBeNull();
  });
});
