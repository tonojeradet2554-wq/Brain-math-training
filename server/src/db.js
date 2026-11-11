import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,
  username_key  TEXT    NOT NULL UNIQUE,   -- case-insensitive lookup key
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT    PRIMARY KEY,          -- sha256 of the cookie token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- One row per game a player starts. The server keeps the secret state
-- (solutions, current problem) here; clients only ever see a public view.
CREATE TABLE IF NOT EXISTS game_sessions (
  id          TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type   TEXT    NOT NULL CHECK (game_type IN ('sudoku', 'make24', 'fastmath')),
  difficulty  TEXT    NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  status      TEXT    NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  score       INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  mistakes    INTEGER NOT NULL DEFAULT 0,
  state       TEXT    NOT NULL,
  started_at  INTEGER NOT NULL,
  deadline_at INTEGER,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions(user_id, game_type, status);

-- Exactly one result per finished session (UNIQUE session_id blocks double saves).
CREATE TABLE IF NOT EXISTS game_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT    NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type     TEXT    NOT NULL,
  difficulty    TEXT    NOT NULL,
  score         INTEGER NOT NULL,
  time_used_ms  INTEGER NOT NULL,
  attempts      INTEGER NOT NULL,
  mistakes      INTEGER NOT NULL,
  personal_best INTEGER NOT NULL DEFAULT 0,
  previous_best INTEGER,
  details       TEXT    NOT NULL DEFAULT '{}',
  played_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_results_user ON game_results(user_id, played_at DESC);

-- Aggregates per player / game / difficulty, updated in the same transaction
-- as each result insert. Powers personal stats and the leaderboard.
CREATE TABLE IF NOT EXISTS player_stats (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type        TEXT    NOT NULL,
  difficulty       TEXT    NOT NULL,
  games_played     INTEGER NOT NULL DEFAULT 0,
  total_score      INTEGER NOT NULL DEFAULT 0,
  best_score       INTEGER NOT NULL DEFAULT 0,
  best_time_ms     INTEGER,
  total_time_ms    INTEGER NOT NULL DEFAULT 0,
  total_attempts   INTEGER NOT NULL DEFAULT 0,
  total_mistakes   INTEGER NOT NULL DEFAULT 0,
  best_achieved_at INTEGER,
  last_played_at   INTEGER,
  PRIMARY KEY (user_id, game_type, difficulty)
);
CREATE INDEX IF NOT EXISTS idx_player_stats_board ON player_stats(game_type, difficulty, best_score DESC);
`;

export function openDatabase(file) {
  const inMemory = file === ':memory:';
  if (!inMemory) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  return withStatementCache(db);
}

/** Adds db.sql(text) which returns a cached prepared statement. */
function withStatementCache(db) {
  const cache = new Map();
  db.sql = (text) => {
    let stmt = cache.get(text);
    if (!stmt) {
      stmt = db.prepare(text);
      cache.set(text, stmt);
    }
    return stmt;
  };
  return db;
}

/** Runs fn inside a write transaction. Not re-entrant: never nest calls. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
