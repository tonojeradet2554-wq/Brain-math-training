import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints.js';
import { setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const { user } = await authApi.me();
      setState({ status: 'ready', user, error: null });
    } catch (error) {
      setState({ status: 'error', user: null, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setUnauthorizedHandler(() => setState((s) => (s.user ? { status: 'ready', user: null, error: null } : s)));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username, password) => {
    const { user } = await authApi.login(username, password);
    setState({ status: 'ready', user, error: null });
    return user;
  }, []);

  const register = useCallback(async (username, password) => {
    const { user } = await authApi.register(username, password);
    setState({ status: 'ready', user, error: null });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState({ status: 'ready', user: null, error: null });
    }
  }, []);

  const value = useMemo(() => ({ ...state, reload: load, login, register, logout }), [state, load, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
