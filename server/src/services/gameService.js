import crypto from 'node:crypto';
import { HttpError } from '../http/errors.js';
import { getGame, assertDifficulty, GAME_TYPES } from '../games/registry.js';

/** Answers that arrive this long after the deadline are still accepted (network latency). */
export const ANSWER_GRACE_MS = 750;
const MAX_WRITE_RETRIES = 5;

/**
 * Server-authoritative game sessions.
 *
 * Integrity guarantees (they hold even with many server instances, e.g. on Vercel):
 *  - Puzzle solutions / answers stay in game_sessions.state and are never sent to clients.
 *  - Timed games end at deadline_at, measured by the server clock.
 *  - make24 / fastmath answers carry the round number; a repeated or late request for a
 *    round that was already solved is rejected (no double scoring from double clicks).
 *  - Every answer write uses `attempts` as an optimistic-concurrency version; on a
 *    collision the request is re-evaluated against the fresh state.
 *  - Finishing is one atomic batch: claim the session, insert the result only if the
 *    session is completed (UNIQUE session_id), update stats only if that insert happened.
 */
export function createGameService({ db, clock, rng, leaderboard }) {
  async function load(userId, id) {
    const row =
      typeof id === 'string' ? await db.get('SELECT * FROM game_sessions WHERE id = ? AND user_id = ?', id, userId) : null;
    if (!row) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Game not found');
    return row;
  }

  const isExpired = (row, now) => row.deadline_at != null && now > row.deadline_at + ANSWER_GRACE_MS;

  async function resultView(row) {
    const r = await db.get('SELECT * FROM game_results WHERE session_id = ?', row.id);
    if (!r) return null;
    return {
      score: r.score,
      timeUsedMs: r.time_used_ms,
      attempts: r.attempts,
      mistakes: r.mistakes,
      playedAt: r.played_at,
      personalBest: r.personal_best === 1,
      previousBest: r.previous_best,
      details: JSON.parse(r.details),
      standing: await leaderboard.standing(row.user_id, row.game_type, row.difficulty),
    };
  }

  async function view(row, now) {
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
      state: row.status === 'active' ? game.publicState(JSON.parse(row.state)) : null,
      result: row.status === 'completed' ? await resultView(row) : null,
    };
  }

  /** Marks an active session completed and records its result exactly once. */
  async function finalize(row, now) {
    const game = getGame(row.game_type);
    const isTime = game.metric === 'time';
    const endedAt = row.deadline_at != null ? Math.min(now, row.deadline_at) : now;
    const details = JSON.stringify(game.resultDetails(JSON.parse(row.state)));

    const previous = isTime ? 'ps.best_time_ms' : 'ps.best_score';
    const isPersonalBest = isTime
      ? '(prev.v IS NULL OR (gs.ended_at - gs.started_at) < prev.v)'
      : '(gs.score > 0 AND (prev.v IS NULL OR gs.score > prev.v))';
    const improved = isTime
      ? 'excluded.best_time_ms IS NOT NULL AND (best_time_ms IS NULL OR excluded.best_time_ms < best_time_ms)'
      : 'excluded.best_score > best_score';

    await db.batch([
      // 1. Claim the session (no-op if it already finished or was abandoned).
      ["UPDATE game_sessions SET status = 'completed', ended_at = ? WHERE id = ? AND status = 'active'", endedAt, row.id],
      // 2. Record the result once (UNIQUE session_id), computing personal best from the prior stats.
      [
        `INSERT OR IGNORE INTO game_results
           (session_id, user_id, game_type, difficulty, score, time_used_ms, attempts, mistakes,
            personal_best, previous_best, details, played_at)
         SELECT gs.id, gs.user_id, gs.game_type, gs.difficulty, gs.score, gs.ended_at - gs.started_at,
                gs.attempts, gs.mistakes, CASE WHEN ${isPersonalBest} THEN 1 ELSE 0 END, prev.v, ?, gs.ended_at
         FROM game_sessions gs
         LEFT JOIN (SELECT ps.user_id, ps.game_type, ps.difficulty, ${previous} AS v FROM player_stats ps) prev
           ON prev.user_id = gs.user_id AND prev.game_type = gs.game_type AND prev.difficulty = gs.difficulty
         WHERE gs.id = ? AND gs.status = 'completed'`,
        details,
        row.id,
      ],
      // 3. Update aggregates only if step 2 inserted a row (changes() = 1).
      [
        `INSERT INTO player_stats
           (user_id, game_type, difficulty, games_played, total_score, best_score, best_time_ms,
            total_time_ms, total_attempts, total_mistakes, best_achieved_at, last_played_at)
         SELECT r.user_id, r.game_type, r.difficulty, 1, r.score, r.score, ${isTime ? 'r.time_used_ms' : 'NULL'},
                r.time_used_ms, r.attempts, r.mistakes, r.played_at, r.played_at
         FROM game_results r
         WHERE r.session_id = ? AND changes() = 1
         ON CONFLICT (user_id, game_type, difficulty) DO UPDATE SET
           games_played = games_played + 1,
           total_score = total_score + excluded.total_score,
           best_score = MAX(best_score, excluded.best_score),
           best_time_ms = CASE
             WHEN excluded.best_time_ms IS NOT NULL AND (best_time_ms IS NULL OR excluded.best_time_ms < best_time_ms)
             THEN excluded.best_time_ms ELSE best_time_ms END,
           total_time_ms = total_time_ms + excluded.total_time_ms,
           total_attempts = total_attempts + excluded.total_attempts,
           total_mistakes = total_mistakes + excluded.total_mistakes,
           best_achieved_at = CASE WHEN ${improved} THEN excluded.best_achieved_at ELSE best_achieved_at END,
           last_played_at = excluded.last_played_at`,
        row.id,
      ],
    ]);
  }

  async function start(user, gameType, difficulty) {
    const game = getGame(gameType);
    assertDifficulty(difficulty);
    const now = clock();
    const id = crypto.randomUUID();
    const state = game.createState(difficulty, rng);
    await db.batch([
      // One active game per player per game type.
      [
        "UPDATE game_sessions SET status = 'abandoned', ended_at = ? WHERE user_id = ? AND game_type = ? AND status = 'active'",
        now,
        user.id,
        gameType,
      ],
      [
        `INSERT INTO game_sessions (id, user_id, game_type, difficulty, status, state, started_at, deadline_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        id,
        user.id,
        gameType,
        difficulty,
        JSON.stringify(state),
        now,
        game.timed ? now + game.durationMs : null,
      ],
    ]);
    return view(await load(user.id, id), now);
  }

  async function get(user, id) {
    const now = clock();
    let row = await load(user.id, id);
    if (row.status === 'active' && isExpired(row, now)) {
      await finalize(row, now);
      row = await load(user.id, id);
    }
    return view(row, now);
  }

  async function findActive(user, gameType) {
    if (!GAME_TYPES.includes(gameType)) throw new HttpError(400, 'INVALID_GAME', 'Unknown game type');
    const now = clock();
    const row = await db.get(
      "SELECT * FROM game_sessions WHERE user_id = ? AND game_type = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
      user.id,
      gameType,
    );
    if (!row) return null;
    if (isExpired(row, now)) {
      await finalize(row, now);
      return null;
    }
    return view(row, now);
  }

  async function answer(user, id, body) {
    for (let tries = 0; tries < MAX_WRITE_RETRIES; tries++) {
      const now = clock();
      let row = await load(user.id, id);

      if (row.status === 'active' && isExpired(row, now)) {
        await finalize(row, now);
        throw new HttpError(409, 'TIME_UP', 'Time’s up!', { session: await view(await load(user.id, id), now) });
      }
      if (row.status !== 'active') {
        throw new HttpError(409, 'GAME_OVER', 'This game has already ended', { session: await view(row, now) });
      }

      const game = getGame(row.game_type);
      const outcome = game.applyAnswer(JSON.parse(row.state), body ?? {}, { difficulty: row.difficulty, rng });
      if (outcome.stale) {
        throw new HttpError(409, 'STALE_ROUND', 'That question was already answered', { session: await view(row, now) });
      }

      const correct = outcome.correct === true;
      const written = await db.run(
        `UPDATE game_sessions
         SET state = ?, score = score + ?, attempts = attempts + 1, mistakes = mistakes + ?
         WHERE id = ? AND status = 'active' AND attempts = ?`,
        JSON.stringify(outcome.state),
        correct ? (outcome.scoreDelta ?? 1) : 0,
        correct ? 0 : 1,
        row.id,
        row.attempts,
      );
      // Another request changed the session first: re-read and judge this answer again.
      if (written.changes === 0) continue;

      row = await load(user.id, id);
      if (outcome.completed) {
        await finalize(row, now);
        row = await load(user.id, id);
      }
      return { correct, feedback: outcome.feedback ?? null, session: await view(row, now) };
    }
    throw new HttpError(409, 'CONFLICT', 'Your answer collided with another one. Please try again.');
  }

  /** Ends a timed round (on the timer, or early by choice) and records the result. Idempotent. */
  async function finish(user, id) {
    const now = clock();
    const row = await load(user.id, id);
    if (row.status === 'completed') return view(row, now);
    if (row.status === 'abandoned') throw new HttpError(409, 'GAME_ABANDONED', 'This game was abandoned');
    if (!getGame(row.game_type).timed) {
      throw new HttpError(400, 'NOT_FINISHABLE', 'Solve the puzzle to finish this game');
    }
    await finalize(row, now);
    return view(await load(user.id, id), now);
  }

  /** Leaves a game without recording it (unless a timed round had already run out). */
  async function abandon(user, id) {
    const now = clock();
    const row = await load(user.id, id);
    if (row.status !== 'active') return view(row, now);
    if (row.deadline_at != null && now >= row.deadline_at) {
      await finalize(row, now);
    } else {
      await db.run("UPDATE game_sessions SET status = 'abandoned', ended_at = ? WHERE id = ? AND status = 'active'", now, row.id);
    }
    return view(await load(user.id, id), now);
  }

  return { start, get, findActive, answer, finish, abandon };
}
