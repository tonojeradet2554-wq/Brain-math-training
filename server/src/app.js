import express from 'express';
import helmet from 'helmet';
import { config as defaultConfig, DEFAULT_LIMITS } from './config.js';
import { apiNotFound, errorHandler } from './http/errors.js';
import { createAuthMiddleware, requireJson, requestLogger } from './http/middleware.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
import { statsRoutes, leaderboardRoutes } from './routes/stats.js';
import { createGameService } from './services/gameService.js';
import { createStatsService } from './services/statsService.js';
import { createLeaderboardService } from './services/leaderboardService.js';

const silentLogger = { info() {}, error() {} };

/**
 * Builds the Express app. Everything stateful is injected so tests can use an
 * in-memory database, a fake clock and a seeded random generator.
 *
 * @param {object} options
 * @param {Awaited<ReturnType<typeof import('./db.js').openDatabase>>} options.db
 * @param {() => number} [options.clock]
 * @param {() => number} [options.rng]
 * @param {(app: import('express').Express) => void} [options.mountFrontend]
 */
export function createApp({
  db,
  clock = Date.now,
  rng = Math.random,
  config = defaultConfig,
  limits = DEFAULT_LIMITS,
  logger = silentLogger,
  logRequests = false,
  strictCsp = true,
  mountFrontend,
}) {
  const leaderboard = createLeaderboardService({ db });
  const games = createGameService({ db, clock, rng, leaderboard });
  const stats = createStatsService({ db });
  const { authenticate, requireAuth } = createAuthMiddleware({ db, clock, cookieName: config.cookieName });

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', true);

  app.use(
    helmet({
      contentSecurityPolicy: strictCsp
        ? {
            useDefaults: true,
            directives: {
              'img-src': ["'self'", 'data:'],
              'upgrade-insecure-requests': config.cookieSecure ? [] : null,
            },
          }
        : false,
      strictTransportSecurity: config.cookieSecure,
    }),
  );
  if (logRequests) app.use('/api', requestLogger(logger));

  app.use('/api', express.json({ limit: '16kb' }), requireJson, authenticate);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes({ db, clock, config, limits }));
  app.use('/api/sessions', requireAuth, sessionRoutes({ games, clock, limits }));
  app.use('/api/stats', requireAuth, statsRoutes({ stats }));
  app.use('/api/leaderboard', requireAuth, leaderboardRoutes({ leaderboard }));
  app.use('/api', apiNotFound);

  mountFrontend?.(app);

  app.use(errorHandler(logger));
  return app;
}
