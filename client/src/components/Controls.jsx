import { useRef } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { LANGUAGES } from '../i18n/translate.js';
import { cx } from '../utils/format.js';

/** Accessible segmented control (radiogroup with arrow-key support). */
export function SegmentedControl({ options, value, onChange, label, className }) {
  const refs = useRef([]);
  const onKeyDown = (e, index) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={cx('segmented', className)} role="radiogroup" aria-label={label}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={value === opt.value ? 0 : -1}
          lang={opt.lang}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** ไทย | EN switch. Each label is tagged with its own language for screen readers. */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <SegmentedControl
      className="lang-switch"
      label={t('language.label')}
      value={lang}
      onChange={setLang}
      options={LANGUAGES.map((id) => ({ value: id, label: t(`language.${id}`), lang: id }))}
    />
  );
}

export function DifficultyBadge({ difficulty }) {
  const { t } = useI18n();
  return (
    <span className={`chip diff-${difficulty}`}>
      <span className="dot" />
      {t(`difficulty.${difficulty}`)}
    </span>
  );
}

export function StatTile({ icon: Icon, label, value, sub, loading }) {
  return (
    <div className="card stat-tile">
      <div className="stat-label">
        {Icon && <Icon />}
        {label}
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 30, width: '60%', marginTop: 6 }} />
      ) : (
        <div className="stat-value tabular">{value}</div>
      )}
      {sub && !loading && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
