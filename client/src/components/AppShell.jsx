import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { BarChart3, ChevronDown, LayoutGrid, LogOut, Trophy } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { LogoMark } from './Icons.jsx';
import { LanguageSwitch } from './Controls.jsx';

const NAV = [
  { to: '/', key: 'nav.dashboard', short: 'nav.dashboard', icon: LayoutGrid, end: true },
  { to: '/stats', key: 'nav.stats', short: 'nav.statsShort', icon: BarChart3 },
  { to: '/leaderboard', key: 'nav.leaderboard', short: 'nav.leaderboard', icon: Trophy },
];

export function Brand() {
  const { t } = useI18n();
  return (
    <Link to="/" className="brand" aria-label={t('app.home')}>
      <LogoMark />
      <span>Cortex</span>
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar">{[...user.username][0]}</span>
        <span className="name">{user.username}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="menu card" role="menu">
          <div className="menu-header">
            <div className="label">{t('menu.signedInAs')}</div>
            <div className="name">{user.username}</div>
          </div>
          <Link to="/stats" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <BarChart3 /> {t('menu.myStats')}
          </Link>
          <button type="button" className="menu-item" role="menuitem" onClick={signOut} disabled={busy}>
            {busy ? <span className="spinner" /> : <LogOut />} {t('menu.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { t } = useI18n();
  return (
    <>
      <header className="app-header">
        <div className="container">
          <Brand />
          <nav className="main-nav" aria-label={t('nav.label')}>
            {NAV.map(({ to, key, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon /> {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <LanguageSwitch />
            <UserMenu />
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <nav className="tabbar" aria-label={t('nav.label')}>
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon /> {t(short)}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
