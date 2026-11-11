import { GAME_TYPES, DIFFICULTIES, getGame } from '../games/registry.js';
import { HttpError } from '../http/errors.js';

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

export function createStatsService({ db }) {
  async function summary(userId) {
    const rows = await db.all('SELECT * FROM player_stats WHERE user_id = ?', userId);
    const totals = { gamesPlayed: 0, totalScore: 0, totalTimeMs: 0 };
    const games = {};

    for (const gameType of GAME_TYPES) {
      const game = getGame(gameType);
      const difficulties = {};
      const overall = { gamesPlayed: 0, totalScore: 0, bestScore: 0, bestTimeMs: null, totalTimeMs: 0, attempts: 0 };
      for (const difficulty of DIFFICULTIES) {
        const row = rows.find((r) => r.game_type === gameType && r.difficulty === difficulty);
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

    const recent = (
      await db.all('SELECT * FROM game_results WHERE user_id = ? ORDER BY played_at DESC, id DESC LIMIT 5', userId)
    ).map(historyItem);

    return { totals, games, recent };
  }

  async function history(userId, { gameType, limit = 20, offset = 0 } = {}) {
    if (gameType && !GAME_TYPES.includes(gameType)) throw new HttpError(400, 'INVALID_GAME', 'Unknown game type');
    const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
    const off = Math.max(Number.parseInt(offset, 10) || 0, 0);
    const where = gameType ? 'user_id = ? AND game_type = ?' : 'user_id = ?';
    const params = gameType ? [userId, gameType] : [userId];
    const [count, rows] = await Promise.all([
      db.get(`SELECT COUNT(*) AS n FROM game_results WHERE ${where}`, ...params),
      db.all(`SELECT * FROM game_results WHERE ${where} ORDER BY played_at DESC, id DESC LIMIT ? OFFSET ?`, ...params, lim, off),
    ]);
    const total = count.n;
    const items = rows.map(historyItem);
    return { items, total, offset: off, limit: lim, hasMore: off + items.length < total };
  }

  return { summary, history };
}
