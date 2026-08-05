import { en } from "./en";
import { ko } from "./ko";

export type MessageKey = keyof typeof en;

export const DICTIONARIES = { en, ko } as const satisfies Record<
  string,
  Record<MessageKey, string>
>;

export type LocaleId = keyof typeof DICTIONARIES;

export const LOCALE_IDS = Object.keys(DICTIONARIES) as LocaleId[];

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: "English",
  ko: "한국어"
};

const STORAGE_KEY = "agents-devtools.locale";

export function isLocaleId(value: unknown): value is LocaleId {
  return typeof value === "string" && Object.hasOwn(DICTIONARIES, value);
}

export function pickLocale(
  stored: string | null,
  navLang: string | undefined
): LocaleId {
  if (isLocaleId(stored)) return stored;
  if (navLang !== undefined) {
    const base = navLang.toLowerCase().split("-")[0];
    if (isLocaleId(base)) return base;
  }
  return "en";
}

export function loadInitialLocale(): LocaleId {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {}
  const navLang =
    typeof navigator === "undefined" ? undefined : navigator.language;
  return pickLocale(stored, navLang);
}

export function persistLocale(locale: LocaleId): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}
}

export type MessageParams = Record<string, string | number>;

export function format(template: string, params?: MessageParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function makeT(locale: LocaleId): Translate {
  const dict = DICTIONARIES[locale];
  return (key, params) => format(dict[key], params);
}
