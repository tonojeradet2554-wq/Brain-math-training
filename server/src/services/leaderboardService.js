import { getGame, assertDifficulty } from '../games/registry.js';

/**
 * Score games rank by best score (ties: whoever got it first).
 * Sudoku ranks by fastest solve time.
 */
export function createLeaderboardService({ db }) {
  const ORDER = {
    score: 'ps.best_score DESC, ps.best_achieved_at ASC, u.username_key ASC',
    time: 'ps.best_time_ms ASC, ps.best_achieved_at ASC, u.username_key ASC',
  };
  const QUALIFIES = {
    score: 'ps.best_score > 0',
    time: 'ps.best_time_ms IS NOT NULL',
  };

  function top(gameType, difficulty, viewerId, limit = 10) {
    const game = getGame(gameType);
    assertDifficulty(difficulty);
    const metric = game.metric;
    const rows = db
      .sql(
        `SELECT ps.user_id, u.username, ps.best_score, ps.best_time_ms, ps.games_played
         FROM player_stats ps JOIN users u ON u.id = ps.user_id
         WHERE ps.game_type = ? AND ps.difficulty = ? AND ${QUALIFIES[metric]}
         ORDER BY ${ORDER[metric]} LIMIT ?`,
      )
      .all(gameType, difficulty, limit);

    const totalPlayers = db
      .sql(`SELECT COUNT(*) AS n FROM player_stats ps WHERE ps.game_type = ? AND ps.difficulty = ? AND ${QUALIFIES[metric]}`)
      .get(gameType, difficulty).n;

    return {
      gameType,
      difficulty,
      metric,
      totalPlayers,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        username: r.username,
        bestScore: r.best_score,
        bestTimeMs: r.best_time_ms,
        gamesPlayed: r.games_played,
        isMe: r.user_id === viewerId,
      })),
      me: viewerId ? standing(viewerId, gameType, difficulty) : null,
    };
  }

  /** The player's position on a board, or null if they haven't qualified. */
  function standing(userId, gameType, difficulty) {
    const metric = getGame(gameType).metric;
    const mine = db
      .sql('SELECT * FROM player_stats WHERE user_id = ? AND game_type = ? AND difficulty = ?')
      .get(userId, gameType, difficulty);
    if (!mine) return null;
    if (metric === 'score' && mine.best_score <= 0) return null;
    if (metric === 'time' && mine.best_time_ms == null) return null;

    const ahead =
      metric === 'score'
        ? db
            .sql(
              `SELECT COUNT(*) AS n FROM player_stats
               WHERE game_type = ? AND difficulty = ? AND user_id != ?
                 AND (best_score > ? OR (best_score = ? AND best_achieved_at < ?))`,
            )
            .get(gameType, difficulty, userId, mine.best_score, mine.best_score, mine.best_achieved_at).n
        : db
            .sql(
              `SELECT COUNT(*) AS n FROM player_stats
               WHERE game_type = ? AND difficulty = ? AND user_id != ? AND best_time_ms IS NOT NULL
                 AND (best_time_ms < ? OR (best_time_ms = ? AND best_achieved_at < ?))`,
            )
            .get(gameType, difficulty, userId, mine.best_time_ms, mine.best_time_ms, mine.best_achieved_at).n;

    return {
      rank: ahead + 1,
      bestScore: mine.best_score,
      bestTimeMs: mine.best_time_ms,
      gamesPlayed: mine.games_played,
    };
  }

  return { top, standing };
}
