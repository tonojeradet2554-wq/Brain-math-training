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

  router.post('/', startLimiter, (req, res) => {
    const { gameType, difficulty } = req.body ?? {};
    res.status(201).json({ session: games.start(req.user, gameType, difficulty) });
  });

  router.get('/active', (req, res) => {
    res.json({ session: games.findActive(req.user, req.query.gameType) });
  });

  router.get('/:id', (req, res) => {
    res.json({ session: games.get(req.user, req.params.id) });
  });

  router.post('/:id/answer', (req, res) => {
    res.json(games.answer(req.user, req.params.id, req.body));
  });

  router.post('/:id/finish', (req, res) => {
    res.json({ session: games.finish(req.user, req.params.id) });
  });

  router.post('/:id/abandon', (req, res) => {
    res.json({ session: games.abandon(req.user, req.params.id) });
  });

  return router;
}
