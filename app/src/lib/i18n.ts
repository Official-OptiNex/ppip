// English / Spanish. Text is written in English in the code and wrapped in t('…');
// the Spanish dictionary (es.ts) maps each English string to its translation.
// Anything missing from the dictionary simply shows in English.
import { useSyncExternalStore } from 'react';
import { ES } from './es';

export type Lang = 'en' | 'es';
const KEY = 'ppip.lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let lang: Lang = initial();
const missing = new Set<string>();
let values: Set<string> | null = null;
/** Already-Spanish text (passing it through t() again is fine and not "missing"). */
const esValues = () => (values ??= new Set(Object.values(ES)));
/** Text shown in Spanish mode that has no translation yet (for testing). */
export function i18nMissing() { return [...missing]; }
(globalThis as { __i18nMissing?: () => string[] }).__i18nMissing = i18nMissing;
const listeners = new Set<() => void>();
document.documentElement.lang = lang;

export function getLang() { return lang; }
/** Switch the screen language right away (the whole app re-renders). Saving to the account is done by the caller. */
export function setLang(l: Lang) {
  if (l !== 'en' && l !== 'es') return;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export function useLang() {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => lang);
}
/** Locale for dates and numbers. */
export function locale() { return lang === 'es' ? 'es-US' : 'en-US'; }

/**
 * Translate. `vars` fill {placeholders}: t('Take {n}', { n: 3 }).
 * Use plural() for "1 day / 2 days".
 */
export function t(en: string, vars?: Record<string, string | number | null | undefined>): string {
  let s = en;
  if (lang === 'es') {
    const es = ES[en];
    if (es != null) s = es;
    else if (en && !esValues().has(en)) missing.add(en); // shown in English; listed by i18nMissing() for checking
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m: string, k: string) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}
/** plural(3, '{n} day', '{n} days') → "3 days" / "3 días". */
export function plural(n: number, one: string, many: string) {
  return t(n === 1 ? one : many, { n });
}
