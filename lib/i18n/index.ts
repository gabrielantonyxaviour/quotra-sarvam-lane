// Quotra lib/i18n — the UI copy dictionary (seam frozen 2026-08-08).
//
// Purpose: the Anthropic lane refines screens while the Sarvam lane adds
// languages, without either editing the other's files. Screens call t();
// translations land ONLY in dictionaries. No i18n framework — a typed object
// is enough for three languages and keeps the bundle honest.
//
// v2 lane: add keys + ta/hi entries in lib/i18n/dictionaries/ (T7). Screens
// not yet wired to t() keep their literals until the post-merge wiring pass.

export type UiLanguage = "en" | "ta" | "hi";

export const LANG_STORAGE_KEY = "quotra_ui_language";

export type Dictionary = Record<string, Partial<Record<UiLanguage, string>>>;

import { en } from "./dictionaries/en";
import { ta } from "./dictionaries/ta";
import { hi } from "./dictionaries/hi";

const DICTIONARIES: Record<UiLanguage, Record<string, string>> = { en, ta, hi };

function browserStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return typeof g.localStorage !== "undefined" && g.localStorage ? g.localStorage : null;
  } catch {
    return null;
  }
}

export function activeLanguage(): UiLanguage {
  const v = browserStorage()?.getItem(LANG_STORAGE_KEY);
  return v === "ta" || v === "hi" ? v : "en";
}

export function setActiveLanguage(lang: UiLanguage): void {
  browserStorage()?.setItem(LANG_STORAGE_KEY, lang);
}

/**
 * Resolve a copy key. Fallback chain: active language → English → the key
 * itself (visible in the UI on purpose — a missing key should be seen, not
 * silently blank).
 */
export function t(key: string, lang: UiLanguage = activeLanguage()): string {
  return DICTIONARIES[lang][key] ?? DICTIONARIES.en[key] ?? key;
}
