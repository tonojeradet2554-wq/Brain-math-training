/** Pure translation + formatting helpers (no React), so they can be unit-tested. */
import { messages, LANGUAGES, DEFAULT_LANGUAGE } from './messages.js';

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/** Returns the translated string (or array) for key, falling back to English, then the key. */
export function translate(lang, key, params = {}) {
  let value = lookup(messages[lang], key);
  if (value === undefined) value = lookup(messages.en, key);
  if (value === undefined) return key;
  if (typeof value === 'function') return value(params);
  if (typeof value === 'string') return value.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
  return value;
}

export function hasKey(lang, key) {
  return lookup(messages[lang], key) !== undefined || lookup(messages.en, key) !== undefined;
}

export const isLanguage = (value) => LANGUAGES.includes(value);

/** Locale-aware formatters. Thai dates use the Buddhist calendar, as Thai readers expect. */
export function createFormatters(lang) {
  const locale = lang === 'th' ? 'th-TH' : 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const t = (key, params) => translate(lang, key, params);
  const pad = (n) => String(n).padStart(2, '0');

  return {
    relative(ts, now = Date.now()) {
      const diff = ts - now;
      const abs = Math.abs(diff);
      if (abs < 45_000) return t('time.justNow');
      if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
      if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
      if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
      return dateFmt.format(ts);
    },
    date: (ts) => dateFmt.format(ts),
    dateTime: (ts) => dateTimeFmt.format(ts),
    /** 522_000 → "8m 42s" / "8 นาที 42 วินาที" */
    duration(ms) {
      if (ms == null) return '—';
      const total = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h) return t('duration.h', { h, m });
      if (m) return t('duration.m', { m, s: pad(s) });
      return t('duration.s', { s });
    },
    greeting(date = new Date()) {
      const hour = date.getHours();
      if (hour >= 5 && hour < 12) return t('dashboard.greeting.morning');
      if (hour >= 12 && hour < 18) return t('dashboard.greeting.afternoon');
      return t('dashboard.greeting.evening');
    },
  };
}

/** Turns an ApiError (or anything thrown) into a message in the current language. */
export function errorMessage(lang, err) {
  const t = (key, params) => translate(lang, key, params);
  if (!err) return t('errors.generic');
  const data = err.data ?? {};
  if (err.code === 'VALIDATION_ERROR') {
    const key = data.field ? `validation.${data.field}.${data.rule}` : `validation.${data.rule}`;
    if (data.rule && hasKey(lang, key)) return t(key);
  }
  if (err.code === 'RATE_LIMITED') {
    return t(`errors.RATE_LIMITED.${hasKey(lang, `errors.RATE_LIMITED.${data.scope}`) ? data.scope : 'default'}`);
  }
  const key = `errors.${err.code}`;
  if (err.code && hasKey(lang, key)) {
    const text = t(key);
    if (typeof text === 'string') return text;
  }
  return t('errors.generic');
}

/** Explains a wrong Make 24 answer from the server's machine-readable feedback. */
export function make24FeedbackMessage(lang, feedback) {
  const t = (key, params) => translate(lang, key, params);
  if (!feedback) return t('make24.wrong.generic');
  switch (feedback.reason) {
    case 'value':
      return t('make24.wrong.value', { value: feedback.value });
    case 'numbers':
      return t(`make24.wrong.${['stray', 'missing', 'reuse'].includes(feedback.detail) ? feedback.detail : 'reuse'}`, {
        number: feedback.number,
      });
    case 'math':
      return t('make24.wrong.div_zero');
    case 'syntax': {
      const key = `make24.wrong.syntax.${feedback.detail}`;
      return hasKey(lang, key) ? t(key, feedback.params ?? {}) : t('make24.wrong.syntax.generic');
    }
    default:
      return t('make24.wrong.generic');
  }
}

export { LANGUAGES, DEFAULT_LANGUAGE };
