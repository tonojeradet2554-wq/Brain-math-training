import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { getPools } from './games/make24.js';

const isDev = process.argv.includes('--dev');
const logger = { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };

const db = openDatabase(config.dbPath);
getPools(); // build Make 24 puzzle pools once at boot (~1s) instead of on the first request

const server = http.createServer();

let mountFrontend;
if (isDev) {
  // Dev: serve the React app through Vite (with HMR) on the same port as the API.
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: config.clientDir,
    configFile: path.join(config.clientDir, 'vite.config.js'),
    server: { middlewareMode: true, ws: { server } },
    appType: 'spa',
  });
  mountFrontend = (app) => app.use(vite.middlewares);
} else if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  mountFrontend = (app) => {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  };
} else {
  logger.error('client/dist not found — run "npm run build" first (or "npm run dev" for development).');
}

const app = createApp({ db, logger, logRequests: isDev, strictCsp: !isDev, mountFrontend });
server.on('request', app);

server.listen(config.port, () => {
  logger.info(`Cortex ${isDev ? '(dev) ' : ''}running at http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
