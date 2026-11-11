import crypto from 'node:crypto';
import { transaction } from '../db.js';
import { HttpError } from '../http/errors.js';
import { getGame, assertDifficulty, GAME_TYPES } from '../games/registry.js';

/** Answers that arrive this long after the deadline are still accepted (network latency). */
export const ANSWER_GRACE_MS = 750;

/**
 * Server-authoritative game sessions.
 *
 * Integrity guarantees:
 *  - Puzzle solutions / answers stay in game_sessions.state and are never sent to clients.
 *  - Timed games end at deadline_at, measured by the server clock.
 *  - make24 / fastmath answers carry the round number; a repeated or late request for a
 *    round that was already solved is rejected (no double scoring from double clicks).
 *  - Every write uses `attempts` as an optimistic-concurrency version.
 *  - A session is finalized once (status guard + UNIQUE(session_id) on game_results).
 */
export function createGameService({ db, clock, rng, leaderboard }) {
  function load(userId, id) {
    const row = typeof id === 'string' ? db.sql('SELECT * FROM game_sessions WHERE id = ? AND user_id = ?').get(id, userId) : null;
    if (!row) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Game not found');
    return row;
  }

  const isExpired = (row, now) => row.deadline_at != null && now > row.deadline_at + ANSWER_GRACE_MS;

  function resultView(row) {
    const r = db.sql('SELECT * FROM game_results WHERE session_id = ?').get(row.id);
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
      standing: leaderboard.standing(row.user_id, row.game_type, row.difficulty),
    };
  }

  function view(row, now) {
    const game = getGame(row.game_type);
    const out = {
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
      state: null,
      result: null,
    };
    if (row.status === 'active') out.state = game.publicState(JSON.parse(row.state));
    if (row.status === 'completed') out.result = resultView(row);
    return out;
  }

  /** Marks an active session completed and records its result exactly once. */
  function finalize(row, now) {
    transaction(db, () => {
      const endedAt = row.deadline_at != null ? Math.min(now, row.deadline_at) : now;
      const claimed = db
        .sql("UPDATE game_sessions SET status = 'completed', ended_at = ? WHERE id = ? AND status = 'active'")
        .run(endedAt, row.id);
      if (claimed.changes === 0) return; // someone else already finalized it

      const fresh = db.sql('SELECT * FROM game_sessions WHERE id = ?').get(row.id);
      const game = getGame(fresh.game_type);
      const timeUsed = Math.max(0, endedAt - fresh.started_at);
      const prior = db
        .sql('SELECT * FROM player_stats WHERE user_id = ? AND game_type = ? AND difficulty = ?')
        .get(fresh.user_id, fresh.game_type, fresh.difficulty);

      let previousBest;
      let personalBest;
      if (game.metric === 'time') {
        previousBest = prior?.best_time_ms ?? null;
        personalBest = previousBest == null || timeUsed < previousBest;
      } else {
        previousBest = prior ? prior.best_score : null;
        personalBest = fresh.score > 0 && (previousBest == null || fresh.score > previousBest);
      }

      db.sql(
        `INSERT INTO game_results
           (session_id, user_id, game_type, difficulty, score, time_used_ms, attempts, mistakes,
            personal_best, previous_best, details, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        fresh.id,
        fresh.user_id,
        fresh.game_type,
        fresh.difficulty,
        fresh.score,
        timeUsed,
        fresh.attempts,
        fresh.mistakes,
        personalBest ? 1 : 0,
        previousBest,
        JSON.stringify(game.resultDetails(JSON.parse(fresh.state))),
        endedAt,
      );

      if (!prior) {
        db.sql(
          `INSERT INTO player_stats
             (user_id, game_type, difficulty, games_played, total_score, best_score, best_time_ms,
              total_time_ms, total_attempts, total_mistakes, best_achieved_at, last_played_at)
           VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          fresh.user_id,
          fresh.game_type,
          fresh.difficulty,
          fresh.score,
          fresh.score,
          game.metric === 'time' ? timeUsed : null,
          timeUsed,
          fresh.attempts,
          fresh.mistakes,
          endedAt,
          endedAt,
        );
      } else {
        db.sql(
          `UPDATE player_stats SET
             games_played = games_played + 1,
             total_score = total_score + ?,
             best_score = MAX(best_score, ?),
             best_time_ms = ?,
             total_time_ms = total_time_ms + ?,
             total_attempts = total_attempts + ?,
             total_mistakes = total_mistakes + ?,
             best_achieved_at = ?,
             last_played_at = ?
           WHERE user_id = ? AND game_type = ? AND difficulty = ?`,
        ).run(
          fresh.score,
          fresh.score,
          game.metric === 'time' ? (personalBest ? timeUsed : prior.best_time_ms) : prior.best_time_ms,
          timeUsed,
          fresh.attempts,
          fresh.mistakes,
          personalBest ? endedAt : prior.best_achieved_at,
          endedAt,
          fresh.user_id,
          fresh.game_type,
          fresh.difficulty,
        );
      }
    });
  }

  function start(user, gameType, difficulty) {
    const game = getGame(gameType);
    assertDifficulty(difficulty);
    const now = clock();
    const id = crypto.randomUUID();
    const state = game.createState(difficulty, rng);
    transaction(db, () => {
      // One active game per player per game type.
      db.sql(
        "UPDATE game_sessions SET status = 'abandoned', ended_at = ? WHERE user_id = ? AND game_type = ? AND status = 'active'",
      ).run(now, user.id, gameType);
      db.sql(
        `INSERT INTO game_sessions (id, user_id, game_type, difficulty, status, state, started_at, deadline_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      ).run(id, user.id, gameType, difficulty, JSON.stringify(state), now, game.timed ? now + game.durationMs : null);
    });
    return view(load(user.id, id), now);
  }

  function get(user, id) {
    const now = clock();
    let row = load(user.id, id);
    if (row.status === 'active' && isExpired(row, now)) {
      finalize(row, now);
      row = load(user.id, id);
    }
    return view(row, now);
  }

  function findActive(user, gameType) {
    if (!GAME_TYPES.includes(gameType)) throw new HttpError(400, 'INVALID_GAME', 'Unknown game type');
    const now = clock();
    const row = db
      .sql("SELECT * FROM game_sessions WHERE user_id = ? AND game_type = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
      .get(user.id, gameType);
    if (!row) return null;
    if (isExpired(row, now)) {
      finalize(row, now);
      return null;
    }
    return view(row, now);
  }

  function answer(user, id, body) {
    const now = clock();
    let row = load(user.id, id);

    if (row.status === 'active' && isExpired(row, now)) {
      finalize(row, now);
      throw new HttpError(409, 'TIME_UP', 'Time’s up!', { session: view(load(user.id, id), now) });
    }
    if (row.status !== 'active') {
      throw new HttpError(409, 'GAME_OVER', 'This game has already ended', { session: view(row, now) });
    }

    const game = getGame(row.game_type);
    const outcome = game.applyAnswer(JSON.parse(row.state), body ?? {}, { difficulty: row.difficulty, rng });
    if (outcome.stale) {
      throw new HttpError(409, 'STALE_ROUND', 'That question was already answered', { session: view(row, now) });
    }

    const correct = outcome.correct === true;
    const scoreDelta = correct ? (outcome.scoreDelta ?? 1) : 0;
    transaction(db, () => {
      const res = db
        .sql(
          `UPDATE game_sessions
           SET state = ?, score = score + ?, attempts = attempts + 1, mistakes = mistakes + ?
           WHERE id = ? AND status = 'active' AND attempts = ?`,
        )
        .run(JSON.stringify(outcome.state), scoreDelta, correct ? 0 : 1, row.id, row.attempts);
      if (res.changes === 0) throw new HttpError(409, 'CONFLICT', 'Your answer collided with another one. Please try again.');
    });

    row = load(user.id, id);
    if (outcome.completed) {
      finalize(row, now);
      row = load(user.id, id);
    }
    return { correct, feedback: outcome.feedback ?? null, session: view(row, now) };
  }

  /** Ends a timed round (on the timer, or early by choice) and records the result. Idempotent. */
  function finish(user, id) {
    const now = clock();
    const row = load(user.id, id);
    if (row.status === 'completed') return view(row, now);
    if (row.status === 'abandoned') throw new HttpError(409, 'GAME_ABANDONED', 'This game was abandoned');
    if (!getGame(row.game_type).timed) {
      throw new HttpError(400, 'NOT_FINISHABLE', 'Solve the puzzle to finish this game');
    }
    finalize(row, now);
    return view(load(user.id, id), now);
  }

  /** Leaves a game without recording it (unless a timed round had already run out). */
  function abandon(user, id) {
    const now = clock();
    const row = load(user.id, id);
    if (row.status !== 'active') return view(row, now);
    if (row.deadline_at != null && now >= row.deadline_at) {
      finalize(row, now);
    } else {
      db.sql("UPDATE game_sessions SET status = 'abandoned', ended_at = ? WHERE id = ? AND status = 'active'").run(now, row.id);
    }
    return view(load(user.id, id), now);
  }

  return { start, get, findActive, answer, finish, abandon };
}
