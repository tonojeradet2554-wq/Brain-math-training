import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Storage is libSQL: a local SQLite file in development, or a hosted Turso
 * database in production (Vercel functions can't keep files between requests).
 */
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

-- Aggregates per player / game / difficulty, updated in the same batch
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

/** libSQL rejects `undefined`; booleans become 0/1. */
const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));

function toObjects(rs) {
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((col, i) => [col, row[i]])));
}

/**
 * Opens the database and makes sure the schema exists.
 * @param {{ url: string, authToken?: string }} options  url is "file:..." locally or "libsql://..." for Turso
 */
export async function openDatabase({ url, authToken }) {
  const isLocalFile = url.startsWith('file:');
  if (isLocalFile) fs.mkdirSync(path.dirname(fileURLToPath(url)), { recursive: true });

  // Remote Turso uses the pure-HTTP client (no native binary to bundle on serverless);
  // local files need the native SQLite driver.
  const { createClient } = isLocalFile ? await import('@libsql/client') : await import('@libsql/client/web');
  const client = createClient({ url, authToken: authToken || undefined, intMode: 'number' });
  if (isLocalFile) {
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA busy_timeout = 5000');
  }
  await client.executeMultiple(SCHEMA);

  return {
    client,
    /** First row as a plain object, or undefined. */
    async get(sql, ...args) {
      return toObjects(await client.execute({ sql, args: clean(args) }))[0];
    },
    async all(sql, ...args) {
      return toObjects(await client.execute({ sql, args: clean(args) }));
    },
    async run(sql, ...args) {
      const rs = await client.execute({ sql, args: clean(args) });
      return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid == null ? undefined : Number(rs.lastInsertRowid) };
    },
    /**
     * Runs statements atomically, in order, on one connection (so SQL changes()
     * can see the previous statement). Each item is [sql, ...args].
     */
    async batch(statements) {
      const results = await client.batch(
        statements.map(([sql, ...args]) => ({ sql, args: clean(args) })),
        'write',
      );
      return results.map((rs) => ({ changes: rs.rowsAffected }));
    },
    close() {
      client.close();
    },
  };
}
