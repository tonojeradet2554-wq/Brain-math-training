import { createBrowserRouter, createHashRouter, Outlet, ScrollRestoration, useParams, useRouteError } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { useAuth } from './auth/AuthContext.jsx';
import { useI18n } from './i18n/I18nContext.jsx';
import { RequireAuth, GuestOnly } from './auth/guards.jsx';
import { AppShell } from './components/AppShell.jsx';
import { ErrorState, FullPageLoader } from './components/States.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import GameSetupPage from './pages/GameSetupPage.jsx';
import GamePlayPage from './pages/GamePlayPage.jsx';
import ResultPage from './pages/ResultPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function Root() {
  const { status, error, reload } = useAuth();
  const { t } = useI18n();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'error') {
    return (
      <div className="full-page">
        <ErrorState title={t('common.cantConnect')} error={error} onRetry={reload} />
      </div>
    );
  }
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/** Remounts a page when its key param changes, so no state leaks between games/sessions. */
function Keyed({ param, page: Page }) {
  const params = useParams();
  return <Page key={params[param]} />;
}

function RouteError() {
  const error = useRouteError();
  const { t } = useI18n();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="full-page">
      <ErrorState
        title={t('common.pageCrashed')}
        action={
          <a className="btn btn-secondary btn-sm" href="/">
            {t('common.backToDashboard')}
          </a>
        }
      />
    </div>
  );
}

// The single-file build uses #/ URLs so it works from any static host or straight from disk.
const createRouter = import.meta.env.MODE === 'single' ? createHashRouter : createBrowserRouter;

const router = createRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          // Immersive game screen — no main navigation.
          { path: '/games/:gameId/play/:sessionId', element: <Keyed param="sessionId" page={GamePlayPage} /> },
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/games/:gameId', element: <Keyed param="gameId" page={GameSetupPage} /> },
              { path: '/results/:sessionId', element: <Keyed param="sessionId" page={ResultPage} /> },
              { path: '/stats', element: <StatsPage /> },
              { path: '/leaderboard', element: <LeaderboardPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
