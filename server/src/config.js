import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..', '..');

const env = process.env;
const onVercel = Boolean(env.VERCEL);

function databaseUrl() {
  if (env.TURSO_DATABASE_URL) return env.TURSO_DATABASE_URL.trim();
  const file = env.DB_PATH || path.join(ROOT_DIR, 'server', 'data', 'cortex.db');
  return pathToFileURL(path.resolve(file)).href;
}

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT) || 3001,
  onVercel,
  // Local SQLite file by default; a Turso URL (libsql://...) in production.
  dbUrl: databaseUrl(),
  dbAuthToken: env.TURSO_AUTH_TOKEN?.trim() || undefined,
  clientDir: path.join(ROOT_DIR, 'client'),
  clientDist: path.join(ROOT_DIR, 'client', 'dist'),
  cookieName: 'cortex_session',
  // Secure cookies whenever we're served over HTTPS (always true on Vercel).
  cookieSecure: env.COOKIE_SECURE === 'true' || onVercel,
  // Behind Vercel's proxy, req.ip must come from X-Forwarded-For (used by rate limits).
  trustProxy: onVercel,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_LIMITS = {
  register: 20, // sign-ups per IP per 15 minutes
  login: 10, // attempts per IP + username per 15 minutes
  startGame: 40, // new game sessions per user per minute
};
