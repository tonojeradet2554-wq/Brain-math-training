import express from 'express';

export function statsRoutes({ stats }) {
  const router = express.Router();

  router.get('/me', (req, res) => {
    res.json(stats.summary(req.user.id));
  });

  router.get('/me/history', (req, res) => {
    const { game, limit, offset } = req.query;
    res.json(stats.history(req.user.id, { gameType: game || undefined, limit, offset }));
  });

  return router;
}

export function leaderboardRoutes({ leaderboard }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { game = 'fastmath', difficulty = 'easy' } = req.query;
    res.json(leaderboard.top(String(game), String(difficulty), req.user.id));
  });

  return router;
}
