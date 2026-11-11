import { api } from './client.js';

const enc = encodeURIComponent;

export const authApi = {
  me: () => api.get('/auth/me'),
  login: (username, password) => api.post('/auth/login', { username, password }),
  register: (username, password) => api.post('/auth/register', { username, password }),
  logout: () => api.post('/auth/logout'),
};

export const sessionsApi = {
  start: (gameType, difficulty) => api.post('/sessions', { gameType, difficulty }).then((r) => r.session),
  get: (id) => api.get(`/sessions/${enc(id)}`).then((r) => r.session),
  active: (gameType) => api.get(`/sessions/active?gameType=${enc(gameType)}`).then((r) => r.session),
  /** Resolves to { correct, feedback, session }. */
  answer: (id, body) => api.post(`/sessions/${enc(id)}/answer`, body),
  finish: (id) => api.post(`/sessions/${enc(id)}/finish`).then((r) => r.session),
  abandon: (id) => api.post(`/sessions/${enc(id)}/abandon`).then((r) => r.session),
};

export const statsApi = {
  summary: () => api.get('/stats/me'),
  history: ({ game, limit = 15, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (game) params.set('game', game);
    return api.get(`/stats/me/history?${params}`);
  },
};

export const leaderboardApi = {
  get: (game, difficulty) => api.get(`/leaderboard?game=${enc(game)}&difficulty=${enc(difficulty)}`),
};
