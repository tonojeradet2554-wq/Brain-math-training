import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';

/** Only signed-in players get past this point; others go to /login and come back after. */
export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Login / register pages bounce signed-in players to where they were going. */
export function GuestOnly() {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return <Navigate to={location.state?.from || '/'} replace />;
  return <Outlet />;
}
