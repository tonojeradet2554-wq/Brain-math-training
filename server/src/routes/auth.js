import express from 'express';
import { HttpError } from '../http/errors.js';
import { createRateLimiter } from '../http/middleware.js';
import { hashPassword, verifyPassword, dummyHash } from '../security/passwords.js';
import { newToken, hashToken } from '../security/tokens.js';

const USERNAME_PATTERN = /^[\p{L}\p{M}\p{N}_]+$/u;

/** `field` + `rule` let the client show the message in the player's language. */
const fieldError = (field, rule, message) => new HttpError(400, 'VALIDATION_ERROR', message, { field, rule });

export function normalizeUsername(raw) {
  return String(raw).normalize('NFC').trim();
}
export const usernameKey = (username) => username.toLocaleLowerCase('en-US');

export function validateUsername(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw fieldError('username', 'required', 'Choose a username');
  const username = normalizeUsername(raw);
  const length = [...username].length;
  if (length < 3 || length > 20) throw fieldError('username', 'length', 'Username must be 3–20 characters');
  if (!USERNAME_PATTERN.test(username)) {
    throw fieldError('username', 'pattern', 'Use letters, numbers and underscores only');
  }
  return username;
}

export function validateNewPassword(raw) {
  if (typeof raw !== 'string' || raw.length === 0) throw fieldError('password', 'required', 'Choose a password');
  if (raw.length < 8) throw fieldError('password', 'min', 'Password must be at least 8 characters');
  if (raw.length > 128) throw fieldError('password', 'max', 'Password must be at most 128 characters');
  return raw;
}

export function authRoutes({ db, clock, config, limits }) {
  const router = express.Router();

  const registerLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: limits.register,
    clock,
    scope: 'register',
    keyFn: (req) => `register:${req.ip}`,
    message: 'Too many sign-ups from this network. Please try again later.',
  });
  const loginLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: limits.login,
    clock,
    scope: 'login',
    keyFn: (req) => `login:${req.ip}:${String(req.body?.username ?? '').trim().toLowerCase()}`,
    message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  });

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  };

  async function startAuthSession(res, userId) {
    const token = newToken();
    const now = clock();
    await db.batch([
      ['DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= ?', userId, now],
      [
        'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        hashToken(token),
        userId,
        now,
        now + config.sessionTtlMs,
      ],
    ]);
    res.cookie(config.cookieName, token, { ...cookieOptions, maxAge: config.sessionTtlMs });
  }

  router.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/register', registerLimiter, async (req, res) => {
    const username = validateUsername(req.body?.username);
    const password = validateNewPassword(req.body?.password);
    const key = usernameKey(username);

    if (await db.get('SELECT 1 FROM users WHERE username_key = ?', key)) {
      throw new HttpError(409, 'USERNAME_TAKEN', 'That username is already taken', { field: 'username' });
    }

    const passwordHash = await hashPassword(password);
    let userId;
    try {
      const info = await db.run(
        'INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)',
        username,
        key,
        passwordHash,
        clock(),
      );
      userId = info.lastInsertRowid;
    } catch (err) {
      // Two sign-ups for the same name raced each other past the check above.
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(String(err?.message) + String(err?.code))) {
        throw new HttpError(409, 'USERNAME_TAKEN', 'That username is already taken', { field: 'username' });
      }
      throw err;
    }

    await startAuthSession(res, userId);
    res.status(201).json({ user: { id: userId, username } });
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { username: rawUsername, password } = req.body ?? {};
    if (typeof rawUsername !== 'string' || !rawUsername.trim() || typeof password !== 'string' || !password) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your username and password', { rule: 'credentials_required' });
    }
    const invalid = new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password');
    if (rawUsername.length > 64 || password.length > 256) throw invalid;

    const user = await db.get(
      'SELECT id, username, password_hash FROM users WHERE username_key = ?',
      usernameKey(normalizeUsername(rawUsername)),
    );
    // Always run scrypt so response time doesn't reveal whether the username exists.
    const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash());
    if (!user || !ok) throw invalid;

    await startAuthSession(res, user.id);
    res.json({ user: { id: user.id, username: user.username } });
  });

  router.post('/logout', async (req, res) => {
    if (req.sessionTokenHash) await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', req.sessionTokenHash);
    res.clearCookie(config.cookieName, cookieOptions);
    res.json({ ok: true });
  });

  return router;
}
