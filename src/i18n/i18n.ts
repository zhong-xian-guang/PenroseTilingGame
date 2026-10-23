/**
 * Locale-independent i18n core: message lookup with `{name}` placeholders and
 * choosing the initial locale. No DOM or Svelte here; the reactive wrapper
 * lives in `index.svelte.ts`.
 */

export const LOCALES = ['zh-TW', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh-TW';

export type Params = Record<string, string | number>;

/** Looks up `key` and fills `{name}` placeholders; unknown placeholders are left as is. */
export function translate(messages: Readonly<Record<string, string>>, key: string, params?: Params): string {
  const template = messages[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/** Saved choice first, then the first browser language we support, then zh-TW. */
export function detectLocale(saved: string | null | undefined, browserLanguages: readonly string[]): Locale {
  if (isLocale(saved)) return saved;
  for (const lang of browserLanguages) {
    const primary = lang.toLowerCase().split('-')[0];
    if (primary === 'zh') return 'zh-TW';
    if (primary === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}
