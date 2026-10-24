/**
 * Colour settings: the player's chosen colours (kite, dart, background), the
 * presets, and the colours derived from them (the tile outline).
 * Pure logic, no DOM: the board merges the result into its Palette.
 */

export interface ColorChoice {
  kite: string;
  dart: string;
  background: string;
}

export interface Settings {
  colors: ColorChoice;
}

export interface Preset {
  /** Stable id; also the i18n key suffix (`settings.preset.<id>`). */
  id: string;
  colors: ColorChoice;
}

/** The colour sets offered in the settings panel; the first is the default. */
export const PRESETS: readonly Preset[] = [
  { id: 'classic', colors: { kite: '#7fa6d6', dart: '#ecbc74', background: '#f6f4ef' } },
  { id: 'night', colors: { kite: '#2f4a7a', dart: '#7a3f63', background: '#141821' } },
  { id: 'forest', colors: { kite: '#8fbc7a', dart: '#e6d7a3', background: '#eef2e6' } },
  { id: 'coral', colors: { kite: '#f08a7e', dart: '#ffd3a8', background: '#fff5ee' } },
  { id: 'mono', colors: { kite: '#d4d4d4', dart: '#a0a0a0', background: '#f4f4f4' } },
];

export const DEFAULT_SETTINGS: Settings = { colors: { ...PRESETS[0]!.colors } };

/** The colours derived from a ColorChoice; the renderer's Palette is a superset. */
export interface DerivedColors {
  background: string;
  tiles: { kite: string; dart: string };
  outline: string;
}

type RGB = [number, number, number];

/** '#rgb' or '#rrggbb' (any case) → '#rrggbb' lowercase; null if not a hex colour. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  return h.length === 3 ? `#${[...h].map((c) => c + c).join('')}` : `#${h}`;
}

const toRgb = (hex: string): RGB => {
  const h = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
};

/** WCAG 2 relative luminance. */
const luminance = (rgb: RGB): number => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (la: number, lb: number) => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

/** WCAG 2 contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  return ratio(luminance(toRgb(a)), luminance(toRgb(b)));
}

/** Dark or light tile outline, whichever reads better on both tile colours. */
function pickOutline(tiles: RGB[]): string {
  const options = ['#2b3440', '#f2f2f2'];
  const score = (c: string) => Math.min(...tiles.map((t) => ratio(luminance(toRgb(c)), luminance(t))));
  return score(options[0]!) >= score(options[1]!) ? options[0]! : options[1]!;
}

/** Board colours for a colour choice: the outline is derived to contrast with the tiles. */
export function derivePalette(colors: ColorChoice): DerivedColors {
  const tiles = [toRgb(colors.kite), toRgb(colors.dart)];
  return {
    background: colors.background,
    tiles: { kite: colors.kite, dart: colors.dart },
    outline: pickOutline(tiles),
  };
}

/** Settings read back from storage (or anything else): invalid fields fall back to the defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const colors = (obj.colors && typeof obj.colors === 'object' ? obj.colors : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    colors: {
      kite: normalizeHex(colors.kite) ?? d.colors.kite,
      dart: normalizeHex(colors.dart) ?? d.colors.dart,
      background: normalizeHex(colors.background) ?? d.colors.background,
    },
  };
}

/** Id of the preset these colours equal, or null when they are custom. */
export function matchPreset(colors: ColorChoice): string | null {
  const c = normalizeSettings({ colors }).colors;
  const p = PRESETS.find((p) => p.colors.kite === c.kite && p.colors.dart === c.dart && p.colors.background === c.background);
  return p?.id ?? null;
}
