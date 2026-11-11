// Vercel serverless entry point. vercel.json rewrites every /api/* request here;
// the Express app sees the original URL and routes it as usual.
import { openDatabase } from '../server/src/db.js';
import { createApp } from '../server/src/app.js';
import { config } from '../server/src/config.js';

const logger = { info() {}, error: (...args) => console.error(...args) };
let appPromise;

function getApp() {
  if (!appPromise) {
    if (config.onVercel && !process.env.TURSO_DATABASE_URL) {
      return Promise.reject(new Error('TURSO_DATABASE_URL is not set in the Vercel project settings'));
    }
    // Opened once per warm instance and reused across requests.
    appPromise = openDatabase({ url: config.dbUrl, authToken: config.dbAuthToken })
      .then((db) => createApp({ db, config, logger }))
      .catch((err) => {
        appPromise = undefined; // retry on the next request
        throw err;
      });
  }
  return appPromise;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await getApp();
  } catch (err) {
    console.error('Startup failed:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'The server is starting up or misconfigured.' } }));
    return;
  }
  return app(req, res);
}
