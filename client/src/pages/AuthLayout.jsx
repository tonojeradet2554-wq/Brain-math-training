import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { LogoMark, GameIcon } from '../components/Icons.jsx';
import { LanguageSwitch } from '../components/Controls.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import '../styles/auth.css';

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <div className="auth-lang">
        <LanguageSwitch />
      </div>
      <div className="auth-panel fade-in">
        <div className="auth-brand">
          <LogoMark size={36} />
          <div className="auth-games" aria-hidden="true">
            <GameIcon game="sudoku" size="sm" />
            <GameIcon game="make24" size="sm" />
            <GameIcon game="fastmath" size="sm" />
          </div>
        </div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        <div className="card auth-card">{children}</div>
        <p className="auth-footer">{footer}</p>
      </div>
    </div>
  );
}

function FieldMessage({ id, hint, error }) {
  if (error) {
    return (
      <span className="error" id={`${id}-error`}>
        {error}
      </span>
    );
  }
  return hint ? (
    <span className="hint" id={`${id}-hint`}>
      {hint}
    </span>
  ) : null;
}

export function TextField({ id, label, hint, error, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function PasswordField({ id, label, hint, error, ...props }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...props}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}
