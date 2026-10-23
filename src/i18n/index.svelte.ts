/**
 * Reactive i18n for the UI. `t()` reads the current locale from `$state`, so any
 * template or `$derived` that calls it re-renders when the locale changes.
 */
import { detectLocale, translate, LOCALES, type Locale, type Params } from './i18n';
import { messages, type MessageKey } from './messages';

export { LOCALES, type Locale, type MessageKey };

const STORAGE_KEY = 'ptg.locale';
const HTML_LANG: Record<Locale, string> = { 'zh-TW': 'zh-Hant-TW', en: 'en' };

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const initial = detectLocale(readSaved(), typeof navigator === 'undefined' ? [] : navigator.languages);
let current = $state<Locale>(initial);

function apply(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = HTML_LANG[locale];
  document.title = translate(messages[locale], 'app.title');
}
apply(initial);

export const i18n = {
  get locale(): Locale {
    return current;
  },
  set locale(locale: Locale) {
    current = locale;
    apply(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Private mode or blocked storage: the choice just won't persist.
    }
  },
  /** Cycles to the next supported locale (two today: zh-TW ⇄ en). */
  toggle() {
    const i = LOCALES.indexOf(current);
    this.locale = LOCALES[(i + 1) % LOCALES.length]!;
  },
};

export function t(key: MessageKey, params?: Params): string {
  return translate(messages[current], key, params);
}
