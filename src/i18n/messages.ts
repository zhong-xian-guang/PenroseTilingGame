import type { Locale } from './i18n';
import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';

/** zh-TW is the reference locale: its keys define the message catalogue. */
export type MessageKey = keyof typeof zhTW;
export type Messages = Record<MessageKey, string>;

// `satisfies` makes a key missing from en.json a type error at build time.
export const messages: Record<Locale, Messages> = {
  'zh-TW': zhTW,
  en: en satisfies Messages,
};
