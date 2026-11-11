/**
 * In-browser backend for the single-file (index.html) build.
 *
 * Implements the same /api endpoints as the Express server, with the same game
 * modules (puzzle generation, answer checking, scoring), but stores data in
 * localStorage. Used when the app is built with `--mode single`, so the whole
 * game works as one static HTML file with no server or database.
 * Data is per browser: every device has its own accounts and leaderboard.
 */
import { getGame, assertDifficulty, GAME_TYPES, DIFFICULTIES } from '../../../server/src/games/registry.js';
import { HttpError } from '../../../server/src/http/errors.js';

const STORE_KEY = 'cortex:local-db:v1';
const ANSWER_GRACE_MS = 750;
const USERNAME_PATTERN = /^[\p{L}\p{M}\p{N}_]+$/u;

/* ---------- storage ---------- */

const fresh = () => ({ nextUserId: 1, nextResultId: 1, currentUserId: null, users: [], sessions: {}, results: [], stats: {} });

function loadDb() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    return parsed && Array.isArray(parsed.users) ? parsed : fresh();
  } catch {
    return fresh();
  }
}

function saveDb(db) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Could not save data in this browser');
  }
}

const statsKey = (userId, gameType, difficulty) => `${userId}|${gameType}|${difficulty}`;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/* ---------- passwords (PBKDF2 via Web Crypto; never stored in plain text) ---------- */

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const ITERATIONS = 150_000;

async function derive(password, salt, iterations) {
  if (!crypto?.subtle) throw new HttpError(500, 'INTERNAL_ERROR', 'Open the game over https or as a local file');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = toB64(await derive(password, fromB64(salt), Number(iterations)));
  return actual === hash;
}

/* ---------- validation (mirrors server/src/routes/auth.js) ---------- */

const fieldError = (field, rule, message) => new HttpError(400, 'VALIDATION_ERROR', message, { field, rule });

function validateUsername(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw fieldError('username', 'required', 'Choose a username');
  const username = raw.normalize('NFC').trim();
  const length = [...username].length;
  if (length < 3 || length > 20) throw fieldError('username', 'length', 'Username must be 3–20 characters');
  if (!USERNAME_PATTERN.test(username)) throw fieldError('username', 'pattern', 'Use letters, numbers and underscores only');
  return username;
}

function validateNewPassword(raw) {
  if (typeof raw !== 'string' || raw.length === 0) throw fieldError('password', 'required', 'Choose a password');
  if (raw.length < 8) throw fieldError('password', 'min', 'Password must be at least 8 characters');
  if (raw.length > 128) throw fieldError('password', 'max', 'Password must be at most 128 characters');
  return raw;
}

/* ---------- game sessions (mirrors server/src/services/gameService.js) ---------- */

const isExpired = (row, now) => row.deadline_at != null && now > row.deadline_at + ANSWER_GRACE_MS;

function requireUser(db) {
  const user = db.users.find((u) => u.id === db.currentUserId);
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  return user;
}

function loadSession(db, user, id) {
  const row = db.sessions[id];
  if (!row || row.user_id !== user.id) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Game not found');
  return row;
}

function standing(db, userId, gameType, difficulty) {
  const metric = getGame(gameType).metric;
  const mine = db.stats[statsKey(userId, gameType, difficulty)];
  if (!mine) return null;
  if (metric === 'score' && mine.best_score <= 0) return null;
  if (metric === 'time' && mine.best_time_ms == null) return null;
  const others = Object.values(db.stats).filter(
    (s) => s.game_type === gameType && s.difficulty === difficulty && s.user_id !== userId,
  );
  const ahead =
    metric === 'score'
      ? others.filter((s) => s.best_score > mine.best_score || (s.best_score === mine.best_score && s.best_achieved_at < mine.best_achieved_at))
      : others.filter(
          (s) =>
            s.best_time_ms != null &&
            (s.best_time_ms < mine.best_time_ms || (s.best_time_ms === mine.best_time_ms && s.best_achieved_at < mine.best_achieved_at)),
        );
  return { rank: ahead.length + 1, bestScore: mine.best_score, bestTimeMs: mine.best_time_ms, gamesPlayed: mine.games_played };
}

function resultView(db, row) {
  const r = db.results.find((x) => x.session_id === row.id);
  if (!r) return null;
  return {
    score: r.score,
    timeUsedMs: r.time_used_ms,
    attempts: r.attempts,
    mistakes: r.mistakes,
    playedAt: r.played_at,
    personalBest: r.personal_best === 1,
    previousBest: r.previous_best,
    details: r.details,
    standing: standing(db, row.user_id, row.game_type, row.difficulty),
  };
}

function view(db, row, now) {
  const game = getGame(row.game_type);
  return {
    id: row.id,
    gameType: row.game_type,
    difficulty: row.difficulty,
    status: row.status,
    metric: game.metric,
    timed: game.timed,
    durationMs: game.durationMs,
    score: row.score,
    attempts: row.attempts,
    mistakes: row.mistakes,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    endedAt: row.ended_at,
    serverNow: now,
    state: row.status === 'active' ? game.publicState(row.state) : null,
    result: row.status === 'completed' ? resultView(db, row) : null,
  };
}

/** Completes a session and records its result exactly once. */
function finalize(db, row, now) {
  if (row.status !== 'active') return;
  const game = getGame(row.game_type);
  const endedAt = row.deadline_at != null ? Math.min(now, row.deadline_at) : now;
  row.status = 'completed';
  row.ended_at = endedAt;
  if (db.results.some((r) => r.session_id === row.id)) return;

  const timeUsed = Math.max(0, endedAt - row.started_at);
  const key = statsKey(row.user_id, row.game_type, row.difficulty);
  const prior = db.stats[key];
  let previousBest;
  let personalBest;
  if (game.metric === 'time') {
    previousBest = prior?.best_time_ms ?? null;
    personalBest = previousBest == null || timeUsed < previousBest;
  } else {
    previousBest = prior ? prior.best_score : null;
    personalBest = row.score > 0 && (previousBest == null || row.score > previousBest);
  }

  db.results.push({
    id: db.nextResultId++,
    session_id: row.id,
    user_id: row.user_id,
    game_type: row.game_type,
    difficulty: row.difficulty,
    score: row.score,
    time_used_ms: timeUsed,
    attempts: row.attempts,
    mistakes: row.mistakes,
    personal_best: personalBest ? 1 : 0,
    previous_best: previousBest,
    details: game.resultDetails(row.state),
    played_at: endedAt,
  });

  const s = prior ?? {
    user_id: row.user_id,
    game_type: row.game_type,
    difficulty: row.difficulty,
    games_played: 0,
    total_score: 0,
    best_score: 0,
    best_time_ms: null,
    total_time_ms: 0,
    total_attempts: 0,
    total_mistakes: 0,
    best_achieved_at: endedAt,
    last_played_at: endedAt,
  };
  s.games_played += 1;
  s.total_score += row.score;
  s.best_score = Math.max(s.best_score, row.score);
  if (game.metric === 'time' && personalBest) s.best_time_ms = timeUsed;
  s.total_time_ms += timeUsed;
  s.total_attempts += row.attempts;
  s.total_mistakes += row.mistakes;
  if (personalBest) s.best_achieved_at = endedAt;
  s.last_played_at = endedAt;
  db.stats[key] = s;

  // Finished rounds don't need their secret state any more; keep storage small.
  row.state = game.timed ? { ...row.state, history: [] } : row.state;
}

/* ---------- stats & leaderboard (mirror the server services) ---------- */

function historyItem(r) {
  return {
    id: r.id,
    sessionId: r.session_id,
    gameType: r.game_type,
    difficulty: r.difficulty,
    score: r.score,
    timeUsedMs: r.time_used_ms,
    attempts: r.attempts,
    mistakes: r.mistakes,
    personalBest: r.personal_best === 1,
    playedAt: r.played_at,
  };
}

function difficultyView(row) {
  if (!row) return null;
  return {
    gamesPlayed: row.games_played,
    totalScore: row.total_score,
    bestScore: row.best_score,
    bestTimeMs: row.best_time_ms,
    averageScore: row.games_played ? row.total_score / row.games_played : 0,
    averageTimeMs: row.games_played ? row.total_time_ms / row.games_played : 0,
    totalTimeMs: row.total_time_ms,
    totalAttempts: row.total_attempts,
    totalMistakes: row.total_mistakes,
    accuracy: row.total_attempts ? row.total_score / row.total_attempts : null,
    lastPlayedAt: row.last_played_at,
  };
}

const byNewest = (a, b) => b.played_at - a.played_at || b.id - a.id;

function summary(db, userId) {
  const totals = { gamesPlayed: 0, totalScore: 0, totalTimeMs: 0 };
  const games = {};
  for (const gameType of GAME_TYPES) {
    const game = getGame(gameType);
    const difficulties = {};
    const overall = { gamesPlayed: 0, totalScore: 0, bestScore: 0, bestTimeMs: null, totalTimeMs: 0, attempts: 0 };
    for (const difficulty of DIFFICULTIES) {
      const row = db.stats[statsKey(userId, gameType, difficulty)];
      difficulties[difficulty] = difficultyView(row);
      if (!row) continue;
      overall.gamesPlayed += row.games_played;
      overall.totalScore += row.total_score;
      overall.totalTimeMs += row.total_time_ms;
      overall.attempts += row.total_attempts;
      overall.bestScore = Math.max(overall.bestScore, row.best_score);
      if (row.best_time_ms != null && (overall.bestTimeMs == null || row.best_time_ms < overall.bestTimeMs)) {
        overall.bestTimeMs = row.best_time_ms;
      }
    }
    totals.gamesPlayed += overall.gamesPlayed;
    totals.totalScore += overall.totalScore;
    totals.totalTimeMs += overall.totalTimeMs;
    games[gameType] = {
      metric: game.metric,
      gamesPlayed: overall.gamesPlayed,
      totalScore: overall.totalScore,
      bestScore: overall.bestScore,
      bestTimeMs: overall.bestTimeMs,
      totalTimeMs: overall.totalTimeMs,
      accuracy: overall.attempts ? overall.totalScore / overall.attempts : null,
      difficulties,
    };
  }
  const recent = db.results.filter((r) => r.user_id === userId).sort(byNewest).slice(0, 5).map(historyItem);
  return { totals, games, recent };
}

function history(db, userId, params) {
  const gameType = params.get('game') || undefined;
  if (gameType && !GAME_TYPES.includes(gameType)) throw new HttpError(400, 'INVALID_GAME', 'Unknown game type');
  const limit = Math.min(Math.max(Number.parseInt(params.get('limit'), 10) || 20, 1), 50);
  const offset = Math.max(Number.parseInt(params.get('offset'), 10) || 0, 0);
  const all = db.results.filter((r) => r.user_id === userId && (!gameType || r.game_type === gameType)).sort(byNewest);
  const items = all.slice(offset, offset + limit).map(historyItem);
  return { items, total: all.length, offset, limit, hasMore: offset + items.length < all.length };
}

function leaderboard(db, userId, params) {
  const gameType = String(params.get('game') ?? 'fastmath');
  const difficulty = String(params.get('difficulty') ?? 'easy');
  const metric = getGame(gameType).metric;
  assertDifficulty(difficulty);
  const usernames = Object.fromEntries(db.users.map((u) => [u.id, u]));
  const qualified = Object.values(db.stats).filter(
    (s) =>
      s.game_type === gameType &&
      s.difficulty === difficulty &&
      (metric === 'score' ? s.best_score > 0 : s.best_time_ms != null),
  );
  qualified.sort((a, b) =>
    metric === 'score'
      ? b.best_score - a.best_score || a.best_achieved_at - b.best_achieved_at
      : a.best_time_ms - b.best_time_ms || a.best_achieved_at - b.best_achieved_at,
  );
  return {
    gameType,
    difficulty,
    metric,
    totalPlayers: qualified.length,
    entries: qualified.slice(0, 10).map((s, i) => ({
      rank: i + 1,
      username: usernames[s.user_id]?.username ?? '?',
      bestScore: s.best_score,
      bestTimeMs: s.best_time_ms,
      gamesPlayed: s.games_played,
      isMe: s.user_id === userId,
    })),
    me: standing(db, userId, gameType, difficulty),
  };
}

/* ---------- router ---------- */

async function route(db, method, path, body) {
  const url = new URL(path, 'http://local');
  const parts = url.pathname.split('/').filter(Boolean);
  const now = Date.now();
  const key = `${method} /${parts.join('/')}`;

  // auth
  if (key === 'GET /auth/me') {
    const user = db.users.find((u) => u.id === db.currentUserId);
    return [200, { user: user ? { id: user.id, username: user.username } : null }];
  }
  if (key === 'POST /auth/register') {
    const username = validateUsername(body?.username);
    const password = validateNewPassword(body?.password);
    const usernameKey = username.toLocaleLowerCase('en-US');
    if (db.users.some((u) => u.username_key === usernameKey)) {
      throw new HttpError(409, 'USERNAME_TAKEN', 'That username is already taken', { field: 'username' });
    }
    const user = { id: db.nextUserId++, username, username_key: usernameKey, password_hash: await hashPassword(password), created_at: now };
    db.users.push(user);
    db.currentUserId = user.id;
    return [201, { user: { id: user.id, username } }];
  }
  if (key === 'POST /auth/login') {
    const { username, password } = body ?? {};
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your username and password', { rule: 'credentials_required' });
    }
    const user = db.users.find((u) => u.username_key === username.normalize('NFC').trim().toLocaleLowerCase('en-US'));
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password');
    }
    db.currentUserId = user.id;
    return [200, { user: { id: user.id, username: user.username } }];
  }
  if (key === 'POST /auth/logout') {
    db.currentUserId = null;
    return [200, { ok: true }];
  }

  const user = requireUser(db);

  // stats & leaderboard
  if (key === 'GET /stats/me') return [200, summary(db, user.id)];
  if (key === 'GET /stats/me/history') return [200, history(db, user.id, url.searchParams)];
  if (key === 'GET /leaderboard') return [200, leaderboard(db, user.id, url.searchParams)];

  // sessions
  if (parts[0] !== 'sessions') throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found');

  if (key === 'POST /sessions') {
    const game = getGame(body?.gameType);
    assertDifficulty(body?.difficulty);
    for (const row of Object.values(db.sessions)) {
      if (row.user_id === user.id && row.game_type === body.gameType && row.status === 'active') {
        row.status = 'abandoned';
        row.ended_at = now;
      }
    }
    // Abandoned games are never shown again; drop them to keep storage small.
    for (const [id, row] of Object.entries(db.sessions)) if (row.status === 'abandoned') delete db.sessions[id];
    const row = {
      id: newId(),
      user_id: user.id,
      game_type: body.gameType,
      difficulty: body.difficulty,
      status: 'active',
      score: 0,
      attempts: 0,
      mistakes: 0,
      state: game.createState(body.difficulty, Math.random),
      started_at: now,
      deadline_at: game.timed ? now + game.durationMs : null,
      ended_at: null,
    };
    db.sessions[row.id] = row;
    return [201, { session: view(db, row, now) }];
  }

  if (key === 'GET /sessions/active') {
    const gameType = url.searchParams.get('gameType');
    if (!GAME_TYPES.includes(gameType)) throw new HttpError(400, 'INVALID_GAME', 'Unknown game type');
    const row = Object.values(db.sessions)
      .filter((r) => r.user_id === user.id && r.game_type === gameType && r.status === 'active')
      .sort((a, b) => b.started_at - a.started_at)[0];
    if (!row) return [200, { session: null }];
    if (isExpired(row, now)) {
      finalize(db, row, now);
      return [200, { session: null }];
    }
    return [200, { session: view(db, row, now) }];
  }

  const row = loadSession(db, user, parts[1]);
  const action = parts[2];

  if (method === 'GET' && !action) {
    if (row.status === 'active' && isExpired(row, now)) finalize(db, row, now);
    return [200, { session: view(db, row, now) }];
  }

  if (method === 'POST' && action === 'answer') {
    if (row.status === 'active' && isExpired(row, now)) {
      finalize(db, row, now);
      throw new HttpError(409, 'TIME_UP', 'Time’s up!', { session: view(db, row, now) });
    }
    if (row.status !== 'active') throw new HttpError(409, 'GAME_OVER', 'This game has already ended', { session: view(db, row, now) });
    const game = getGame(row.game_type);
    const outcome = game.applyAnswer(row.state, body ?? {}, { difficulty: row.difficulty, rng: Math.random });
    if (outcome.stale) throw new HttpError(409, 'STALE_ROUND', 'That question was already answered', { session: view(db, row, now) });
    const correct = outcome.correct === true;
    row.state = outcome.state;
    row.score += correct ? (outcome.scoreDelta ?? 1) : 0;
    row.attempts += 1;
    row.mistakes += correct ? 0 : 1;
    if (outcome.completed) finalize(db, row, now);
    return [200, { correct, feedback: outcome.feedback ?? null, session: view(db, row, now) }];
  }

  if (method === 'POST' && action === 'finish') {
    if (row.status === 'abandoned') throw new HttpError(409, 'GAME_ABANDONED', 'This game was abandoned');
    if (row.status === 'active') {
      if (!getGame(row.game_type).timed) throw new HttpError(400, 'NOT_FINISHABLE', 'Solve the puzzle to finish this game');
      finalize(db, row, now);
    }
    return [200, { session: view(db, row, now) }];
  }

  if (method === 'POST' && action === 'abandon') {
    if (row.status === 'active') {
      if (row.deadline_at != null && now >= row.deadline_at) finalize(db, row, now);
      else {
        row.status = 'abandoned';
        row.ended_at = now;
      }
    }
    return [200, { session: view(db, row, now) }];
  }

  throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found');
}

/** Same contract as an HTTP round trip: resolves to { status, payload }. */
export async function handleLocal(method, path, body) {
  const db = loadDb();
  try {
    const [status, payload] = await route(db, method, path, body);
    saveDb(db);
    return { status, payload };
  } catch (err) {
    if (err instanceof HttpError) {
      saveDb(db); // e.g. TIME_UP finalizes the round before reporting it
      return { status: err.status, payload: { error: { code: err.code, message: err.message, ...err.details } } };
    }
    console.error(err);
    return { status: 500, payload: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } } };
  }
}
