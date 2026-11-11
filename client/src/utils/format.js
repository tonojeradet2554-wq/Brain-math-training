/* Language-neutral formatting. Language-aware formatters (dates, durations,
   relative time, greetings) live in i18n/translate.js → useI18n().fmt */

const pad = (n) => String(n).padStart(2, '0');

/** 83_000 → "1:23", 3_723_000 → "1:02:03" */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Countdown rounds up so "0:00" only shows when time is truly up. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

const numberFmt = new Intl.NumberFormat('en');
export const formatNumber = (n) => (n == null ? '—' : numberFmt.format(Math.round(n * 10) / 10));
export const formatPercent = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export const cx = (...classes) => classes.filter(Boolean).join(' ');
