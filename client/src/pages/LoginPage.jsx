import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { InlineError } from '../components/States.jsx';
import { AuthLayout, PasswordField, TextField } from './AuthLayout.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, errorText } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  // Errors are stored as translation keys / error objects so switching language re-translates them.
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: null }));
    setFormError(null);
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const next = {};
    if (!form.username.trim()) next.username = 'validation.username.enter';
    if (!form.password) next.password = 'validation.password.enter';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await login(form.username.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setFormError(err);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.footer')}{' '}
          <Link to="/register" state={location.state}>
            {t('auth.login.footerLink')}
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
          value={form.username}
          onChange={update('username')}
          error={errors.username && t(errors.username)}
        />
        <PasswordField
          id="password"
          label={t('auth.password')}
          autoComplete="current-password"
          value={form.password}
          onChange={update('password')}
          error={errors.password && t(errors.password)}
        />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
          {submitting && <span className="spinner" />}
          {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </button>
      </form>
    </AuthLayout>
  );
}
