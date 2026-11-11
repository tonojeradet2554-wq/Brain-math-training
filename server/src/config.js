import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..', '..');

const env = process.env;

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT) || 3001,
  dbPath: env.DB_PATH || path.join(ROOT_DIR, 'server', 'data', 'cortex.db'),
  clientDir: path.join(ROOT_DIR, 'client'),
  clientDist: path.join(ROOT_DIR, 'client', 'dist'),
  cookieName: 'cortex_session',
  // Set COOKIE_SECURE=true when the app is served over HTTPS.
  cookieSecure: env.COOKIE_SECURE === 'true',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_LIMITS = {
  register: 20, // sign-ups per IP per 15 minutes
  login: 10, // attempts per IP + username per 15 minutes
  startGame: 40, // new game sessions per user per minute
};
