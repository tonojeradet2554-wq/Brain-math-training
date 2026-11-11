import { AlertTriangle, Inbox, RotateCw } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { cx } from '../utils/format.js';

export function Spinner({ large, label }) {
  const { t } = useI18n();
  return <span className={cx('spinner', large && 'lg')} role="status" aria-label={label ?? t('common.loading')} />;
}

export function FullPageLoader() {
  return (
    <div className="full-page">
      <Spinner large />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="state">
      <span className="state-icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** `error` is translated from its code; arbitrary crashes get a generic message. */
export function ErrorState({ title, error, onRetry, action }) {
  const { t, errorText } = useI18n();
  return (
    <div className="state error" role="alert">
      <span className="state-icon">
        <AlertTriangle />
      </span>
      <h3>{title ?? t('common.errorTitle')}</h3>
      <p>{errorText(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RotateCw /> {t('common.retry')}
        </button>
      )}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, radius, style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function InlineError({ children }) {
  if (!children) return null;
  return (
    <div className="alert" role="alert">
      <AlertTriangle />
      <span>{children}</span>
    </div>
  );
}
