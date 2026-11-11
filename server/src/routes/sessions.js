import express from 'express';
import { createRateLimiter } from '../http/middleware.js';

export function sessionRoutes({ games, clock, limits }) {
  const router = express.Router();

  const startLimiter = createRateLimiter({
    windowMs: 60_000,
    max: limits.startGame,
    clock,
    scope: 'start',
    keyFn: (req) => `start:${req.user.id}`,
    message: 'You’re starting games too quickly. Please wait a moment.',
  });

  router.post('/', startLimiter, async (req, res) => {
    const { gameType, difficulty } = req.body ?? {};
    res.status(201).json({ session: await games.start(req.user, gameType, difficulty) });
  });

  router.get('/active', async (req, res) => {
    res.json({ session: await games.findActive(req.user, req.query.gameType) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ session: await games.get(req.user, req.params.id) });
  });

  router.post('/:id/answer', async (req, res) => {
    res.json(await games.answer(req.user, req.params.id, req.body));
  });

  router.post('/:id/finish', async (req, res) => {
    res.json({ session: await games.finish(req.user, req.params.id) });
  });

  router.post('/:id/abandon', async (req, res) => {
    res.json({ session: await games.abandon(req.user, req.params.id) });
  });

  return router;
}
