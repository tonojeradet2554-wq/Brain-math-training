import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seededRng } from '../src/games/random.js';
import { config } from '../src/config.js';

/** Boots the real app on a random port with a throwaway database file and a controllable clock. */
export async function startTestServer({ limits } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-test-'));
  const db = await openDatabase({ url: pathToFileURL(path.join(dir, 'test.db')).href });
  const time = { now: 1_750_000_000_000 };
  const app = createApp({
    db,
    clock: () => time.now,
    rng: seededRng(7),
    limits: { register: 1000, login: 1000, startGame: 1000, ...limits },
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    db,
    time,
    base,
    advance: (ms) => (time.now += ms),
    secretState: async (sessionId) => JSON.parse((await db.get('SELECT state FROM game_sessions WHERE id = ?', sessionId)).state),
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        /* Windows may still hold the SQLite file for a moment; it's only a temp dir. */
      }
    },
  };
}

/** A tiny HTTP client with its own cookie jar (one per simulated browser). */
export function createClient(base) {
  let cookie = '';
  async function call(method, path, body, headers = {}) {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (pair.slice(0, eq) === config.cookieName) {
        const value = pair.slice(eq + 1);
        cookie = value ? `${config.cookieName}=${value}` : '';
      }
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
    call,
    get cookie() {
      return cookie;
    },
  };
}

export async function registeredClient(base, username, password = 'correct-horse-1') {
  const client = createClient(base);
  const res = await client.post('/auth/register', { username, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.data)}`);
  return client;
}
