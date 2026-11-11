import { HttpError } from './errors.js';
import { hashToken } from '../security/tokens.js';

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/**
 * State-changing API calls must be JSON. Browsers can't send a cross-site
 * JSON request without a CORS preflight, which (with SameSite cookies)
 * shuts the door on CSRF.
 */
export function requireJson(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!req.is('application/json')) {
    return next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must be sent as JSON'));
  }
  return next();
}

export function createAuthMiddleware({ db, clock, cookieName }) {
  function authenticate(req, res, next) {
    req.user = null;
    req.sessionTokenHash = null;
    const token = parseCookies(req.headers.cookie)[cookieName];
    if (token && token.length <= 128) {
      const tokenHash = hashToken(token);
      const row = db
        .sql(
          `SELECT u.id, u.username FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ?`,
        )
        .get(tokenHash, clock());
      if (row) {
        req.user = { id: row.id, username: row.username };
        req.sessionTokenHash = tokenHash;
      }
    }
    next();
  }

  function requireAuth(req, res, next) {
    if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
    return next();
  }

  return { authenticate, requireAuth };
}

/** Small fixed-window in-memory rate limiter (good enough for a single process). */
export function createRateLimiter({ windowMs, max, keyFn, message, scope = 'default', clock = Date.now }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = clock();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = clock();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return next(new HttpError(429, 'RATE_LIMITED', message ?? 'Too many requests. Please wait a moment.', { scope }));
    }
    return next();
  };
}

export function requestLogger(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  };
}
