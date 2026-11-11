import express from 'express';

export function statsRoutes({ stats }) {
  const router = express.Router();

  router.get('/me', async (req, res) => {
    res.json(await stats.summary(req.user.id));
  });

  router.get('/me/history', async (req, res) => {
    const { game, limit, offset } = req.query;
    res.json(await stats.history(req.user.id, { gameType: game || undefined, limit, offset }));
  });

  return router;
}

export function leaderboardRoutes({ leaderboard }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { game = 'fastmath', difficulty = 'easy' } = req.query;
    res.json(await leaderboard.top(String(game), String(difficulty), req.user.id));
  });

  return router;
}
