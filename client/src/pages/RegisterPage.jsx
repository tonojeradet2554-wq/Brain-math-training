import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { InlineError } from '../components/States.jsx';
import { AuthLayout, PasswordField, TextField } from './AuthLayout.jsx';

const USERNAME_PATTERN = /^[\p{L}\p{M}\p{N}_]+$/u;

/** Mirrors the server rules; returns translation keys per field. */
function validate({ username, password, confirm }) {
  const errors = {};
  const name = username.normalize('NFC').trim();
  const length = [...name].length;
  if (!name) errors.username = 'validation.username.required';
  else if (length < 3 || length > 20) errors.username = 'validation.username.length';
  else if (!USERNAME_PATTERN.test(name)) errors.username = 'validation.username.pattern';
  if (!password) errors.password = 'validation.password.required';
  else if (password.length < 8) errors.password = 'validation.password.min';
  else if (password.length > 128) errors.password = 'validation.password.max';
  if (password && confirm !== password) errors.confirm = 'validation.confirm.mismatch';
  return errors;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const { t, errorText } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({}); // field -> translation key or ApiError
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: null }));
    setFormError(null);
  };

  const fieldError = (field) => {
    const value = errors[field];
    if (!value) return null;
    return typeof value === 'string' ? t(value) : errorText(value);
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await register(form.username.normalize('NFC').trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      const field = err.data?.field ?? (err.code === 'USERNAME_TAKEN' ? 'username' : null);
      if (field) setErrors({ [field]: err });
      else setFormError(err);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.footer')}{' '}
          <Link to="/login" state={location.state}>
            {t('auth.register.footerLink')}
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <InlineError>{formError && errorText(formError)}</InlineError>
        <TextField
          id="username"
          label={t('auth.username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          maxLength={20}
          value={form.username}
          onChange={update('username')}
          hint={t('auth.register.usernameHint')}
          error={fieldError('username')}
        />
        <PasswordField
          id="password"
          label={t('auth.password')}
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          hint={t('auth.register.passwordHint')}
          error={fieldError('password')}
        />
        <PasswordField
          id="confirm"
          label={t('auth.confirm')}
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          error={fieldError('confirm')}
        />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
          {submitting && <span className="spinner" />}
          {submitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </button>
      </form>
    </AuthLayout>
  );
}
