import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, createClient, registeredClient } from './helpers.js';
import { findSolution } from '../src/games/make24.js';

let ctx;
before(async () => {
  ctx = await startTestServer();
});
after(() => ctx.close());

const resultCount = (sessionId) => ctx.db.prepare('SELECT COUNT(*) AS n FROM game_results WHERE session_id = ?').get(sessionId).n;

describe('auth', () => {
  test('rejects invalid registrations with field-level errors', async () => {
    const c = createClient(ctx.base);
    const cases = [
      [{ username: 'ab', password: 'longenough' }, 'username', 'length'],
      [{ username: 'has space', password: 'longenough' }, 'username', 'pattern'],
      [{ username: 'x'.repeat(21), password: 'longenough' }, 'username', 'length'],
      [{ password: 'longenough' }, 'username', 'required'],
      [{ username: 'validname', password: 'short' }, 'password', 'min'],
      [{ username: 'validname' }, 'password', 'required'],
    ];
    for (const [body, field, rule] of cases) {
      const res = await c.post('/auth/register', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.data.error.field, field);
      assert.equal(res.data.error.rule, rule, 'rule lets the client translate the message');
    }
    assert.equal((await c.post('/auth/register', { username: 'สมชาย_99', password: 'longenough' })).status, 201, 'Thai usernames are allowed');
  });

  test('register → me → logout → me', async () => {
    const c = createClient(ctx.base);
    const reg = await c.post('/auth/register', { username: 'Alice_01', password: 'wonderland' });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.username, 'Alice_01');
    assert.match(reg.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(reg.headers.get('set-cookie'), /SameSite=Lax/i);

    assert.equal((await c.get('/auth/me')).data.user.username, 'Alice_01');
    assert.equal((await c.post('/auth/logout')).status, 200);
    assert.equal((await c.get('/auth/me')).data.user, null);
  });

  test('stores a salted scrypt hash, never the password', () => {
    const row = ctx.db.prepare("SELECT password_hash FROM users WHERE username = 'Alice_01'").get();
    assert.match(row.password_hash, /^scrypt\$/);
    assert.ok(!row.password_hash.includes('wonderland'));
  });

  test('usernames are unique case-insensitively', async () => {
    const res = await createClient(ctx.base).post('/auth/register', { username: 'alice_01', password: 'anotherpass' });
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, 'USERNAME_TAKEN');
  });

  test('login checks the password and is case-insensitive on username', async () => {
    const c = createClient(ctx.base);
    const bad = await c.post('/auth/login', { username: 'alice_01', password: 'nope-nope' });
    assert.equal(bad.status, 401);
    const unknown = await c.post('/auth/login', { username: 'ghost', password: 'whatever1' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.data.error.message, bad.data.error.message); // no username enumeration
    const ok = await c.post('/auth/login', { username: 'ALICE_01', password: 'wonderland' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.username, 'Alice_01');
  });

  test('logging out kills the server-side session (old cookie is useless)', async () => {
    const c = await registeredClient(ctx.base, 'logout_test');
    const stolen = c.cookie;
    await c.post('/auth/logout');
    const replay = await createClient(ctx.base).call('GET', '/stats/me', undefined, { cookie: stolen });
    assert.equal(replay.status, 401);
  });

  test('game, stats and leaderboard endpoints require login', async () => {
    const anon = createClient(ctx.base);
    for (const [method, path] of [
      ['POST', '/sessions'],
      ['GET', '/stats/me'],
      ['GET', '/stats/me/history'],
      ['GET', '/leaderboard?game=fastmath&difficulty=easy'],
    ]) {
      const res = await anon.call(method, path, method === 'POST' ? { gameType: 'fastmath', difficulty: 'easy' } : undefined);
      assert.equal(res.status, 401, path);
    }
  });

  test('mutations must be JSON (CSRF guard)', async () => {
    const c = await registeredClient(ctx.base, 'csrf_test');
    const res = await c.call('POST', '/sessions', 'gameType=fastmath', { 'content-type': 'application/x-www-form-urlencoded' });
    assert.equal(res.status, 415);
  });

  test('login is rate limited', async () => {
    const limited = await startTestServer({ limits: { login: 3 } });
    try {
      const c = createClient(limited.base);
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await c.post('/auth/login', { username: 'bob', password: 'guess' + i })).status);
      assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
      const limited429 = await c.post('/auth/login', { username: 'bob', password: 'again' });
      assert.equal(limited429.data.error.scope, 'login');
    } finally {
      await limited.close();
    }
  });
});

describe('fast math', () => {
  test('full round: wrong answer keeps the problem, right answer scores once, timer ends the game', async () => {
    const c = await registeredClient(ctx.base, 'speedy');
    const start = await c.post('/sessions', { gameType: 'fastmath', difficulty: 'normal' });
    assert.equal(start.status, 201);
    const s = start.data.session;
    assert.equal(s.durationMs, 60_000);
    assert.equal(s.deadlineAt - s.startedAt, 60_000);
    assert.equal(s.state.problem.answer, undefined, 'answer must not leak');

    const { problem } = ctx.secretState(s.id);
    const wrong = await c.post(`/sessions/${s.id}/answer`, { round: 1, answer: problem.answer + 1 });
    assert.equal(wrong.data.correct, false);
    assert.equal(wrong.data.session.score, 0);
    assert.equal(wrong.data.session.state.round, 1);
    assert.equal(wrong.data.session.state.problem.text, s.state.problem.text, 'same problem after a wrong answer');

    const right = await c.post(`/sessions/${s.id}/answer`, { round: 1, answer: problem.answer });
    assert.equal(right.data.correct, true);
    assert.equal(right.data.session.score, 1);
    assert.equal(right.data.session.state.round, 2);

    // Double-click / replay of the round that was already solved: no extra point.
    const replay = await c.post(`/sessions/${s.id}/answer`, { round: 1, answer: problem.answer });
    assert.equal(replay.status, 409);
    assert.equal(replay.data.error.code, 'STALE_ROUND');
    assert.equal(replay.data.error.session.score, 1);

    // Time keeps running: after 60s (+grace) answers are refused and the round is recorded.
    ctx.advance(61_000);
    const next = ctx.secretState(s.id).problem;
    const late = await c.post(`/sessions/${s.id}/answer`, { round: 2, answer: next.answer });
    assert.equal(late.status, 409);
    assert.equal(late.data.error.code, 'TIME_UP');
    const done = late.data.error.session;
    assert.equal(done.status, 'completed');
    assert.equal(done.result.score, 1);
    assert.equal(done.result.timeUsedMs, 60_000);
    assert.equal(done.result.attempts, 2);
    assert.equal(done.result.mistakes, 1);
    assert.equal(done.result.personalBest, true);
    assert.equal(done.result.standing.rank, 1);

    // finish() after the fact is idempotent and never saves twice.
    const f1 = await c.post(`/sessions/${s.id}/finish`);
    const f2 = await c.post(`/sessions/${s.id}/finish`);
    assert.equal(f1.data.session.result.score, 1);
    assert.equal(f2.data.session.result.score, 1);
    assert.equal(resultCount(s.id), 1);
  });

  test('answers within the grace window still count; finishing at 0:00 records the score', async () => {
    const c = await registeredClient(ctx.base, 'grace');
    const s = (await c.post('/sessions', { gameType: 'fastmath', difficulty: 'easy' })).data.session;
    ctx.advance(60_400); // 400ms past the deadline — inside the 750ms grace window
    const ans = ctx.secretState(s.id).problem.answer;
    const res = await c.post(`/sessions/${s.id}/answer`, { round: 1, answer: ans });
    assert.equal(res.data.correct, true);
    const fin = await c.post(`/sessions/${s.id}/finish`);
    assert.equal(fin.data.session.result.score, 1);
    assert.equal(fin.data.session.result.timeUsedMs, 60_000, 'time used is capped at the round length');
  });

  test('parallel duplicate submissions only score once', async () => {
    const c = await registeredClient(ctx.base, 'clicker');
    const s = (await c.post('/sessions', { gameType: 'fastmath', difficulty: 'easy' })).data.session;
    const ans = ctx.secretState(s.id).problem.answer;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => c.post(`/sessions/${s.id}/answer`, { round: 1, answer: ans })),
    );
    assert.equal(results.filter((r) => r.status === 200 && r.data.correct).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 7);
    assert.equal((await c.get(`/sessions/${s.id}`)).data.session.score, 1);
  });

  test('rejects malformed answers without counting an attempt', async () => {
    const c = await registeredClient(ctx.base, 'typo');
    const s = (await c.post('/sessions', { gameType: 'fastmath', difficulty: 'easy' })).data.session;
    for (const answer of ['12', 1.5, null]) {
      const res = await c.post(`/sessions/${s.id}/answer`, { round: 1, answer });
      assert.equal(res.status, 400);
    }
    assert.equal((await c.get(`/sessions/${s.id}`)).data.session.attempts, 0);
  });
});

describe('make 24', () => {
  test('validates expressions server-side and serves a new puzzle after a correct one', async () => {
    const c = await registeredClient(ctx.base, 'maker');
    const s = (await c.post('/sessions', { gameType: 'make24', difficulty: 'hard' })).data.session;
    assert.equal(s.durationMs, 180_000);
    const numbers = s.state.numbers;
    assert.equal(numbers.length, 4);

    const sum = await c.post(`/sessions/${s.id}/answer`, { round: 1, expression: numbers.join('+') });
    if (numbers.reduce((a, b) => a + b, 0) !== 24) {
      assert.equal(sum.data.correct, false);
      assert.match(sum.data.feedback.message, /not 24/);
    }
    const cheat = await c.post(`/sessions/${s.id}/answer`, { round: 1, expression: '24' });
    assert.equal(cheat.data.correct, false);
    assert.equal(cheat.data.feedback.reason, 'numbers');
    assert.equal(cheat.data.feedback.detail, 'stray');
    assert.equal(cheat.data.feedback.number, 24);
    const evil = await c.post(`/sessions/${s.id}/answer`, { round: 1, expression: 'process.exit()' });
    assert.equal(evil.data.correct, false);
    assert.equal(evil.data.feedback.reason, 'syntax');
    assert.equal(evil.data.feedback.detail, 'bad_char');
    assert.deepEqual(evil.data.feedback.params, { char: 'p' });

    const solution = findSolution(numbers);
    const ok = await c.post(`/sessions/${s.id}/answer`, { round: 1, expression: solution });
    assert.equal(ok.data.correct, true, solution);
    const after = ok.data.session;
    assert.equal(after.score, 1);
    assert.equal(after.state.round, 2);

    // End the round early: recorded with the actual time used.
    ctx.advance(42_000);
    const fin = await c.post(`/sessions/${s.id}/finish`);
    assert.equal(fin.data.session.status, 'completed');
    assert.equal(fin.data.session.result.score, 1);
    assert.equal(fin.data.session.result.timeUsedMs, 42_000);
    assert.ok(fin.data.session.result.details.lastPuzzle.solution);
  });
});

describe('sudoku', () => {
  test('wrong numbers are flagged, correct ones lock in, solving records time', async () => {
    const c = await registeredClient(ctx.base, 'solver');
    const s = (await c.post('/sessions', { gameType: 'sudoku', difficulty: 'easy' })).data.session;
    assert.equal(s.deadlineAt, null);
    assert.equal(JSON.stringify(s).includes('solution'), false, 'solution must not leak');
    const { puzzle, solution } = ctx.secretState(s.id);
    const blanks = [...puzzle].map((ch, i) => (ch === '0' ? i : -1)).filter((i) => i >= 0);

    const fixed = puzzle.indexOf(puzzle.match(/[1-9]/)[0]);
    assert.equal((await c.post(`/sessions/${s.id}/answer`, { cell: fixed, value: 1 })).data.error.code, 'FIXED_CELL');

    const first = blanks[0];
    const wrongValue = (Number(solution[first]) % 9) + 1;
    const wrong = await c.post(`/sessions/${s.id}/answer`, { cell: first, value: wrongValue });
    assert.equal(wrong.data.correct, false);
    assert.equal(wrong.data.session.mistakes, 1);

    const right = await c.post(`/sessions/${s.id}/answer`, { cell: first, value: Number(solution[first]) });
    assert.equal(right.data.correct, true);
    assert.equal(right.data.session.state.board[first], solution[first]);
    const again = await c.post(`/sessions/${s.id}/answer`, { cell: first, value: Number(solution[first]) });
    assert.equal(again.data.error.code, 'ALREADY_FILLED');

    // Sudoku can't be "finished" without solving it.
    assert.equal((await c.post(`/sessions/${s.id}/finish`)).status, 400);

    // The game is resumable: the active session is discoverable.
    const active = await c.get('/sessions/active?gameType=sudoku');
    assert.equal(active.data.session.id, s.id);

    ctx.advance(5 * 60_000);
    let last;
    for (const cell of blanks.slice(1)) {
      last = await c.post(`/sessions/${s.id}/answer`, { cell, value: Number(solution[cell]) });
      assert.equal(last.data.correct, true);
    }
    const done = last.data.session;
    assert.equal(done.status, 'completed');
    assert.equal(done.result.score, blanks.length);
    assert.equal(done.result.timeUsedMs, 5 * 60_000);
    assert.equal(done.result.mistakes, 1);
    assert.equal(resultCount(s.id), 1);
    assert.equal((await c.get('/sessions/active?gameType=sudoku')).data.session, null);
  });
});

describe('sessions, stats and leaderboard', () => {
  test('players cannot see or touch each other’s games', async () => {
    const a = await registeredClient(ctx.base, 'owner_a');
    const b = await registeredClient(ctx.base, 'intruder_b');
    const s = (await a.post('/sessions', { gameType: 'fastmath', difficulty: 'easy' })).data.session;
    assert.equal((await b.get(`/sessions/${s.id}`)).status, 404);
    assert.equal((await b.post(`/sessions/${s.id}/answer`, { round: 1, answer: 1 })).status, 404);
    assert.equal((await b.post(`/sessions/${s.id}/abandon`)).status, 404);
    assert.equal((await a.get(`/sessions/${s.id}`)).data.session.status, 'active');
  });

  test('abandoned games are not recorded; starting a new game abandons the old one', async () => {
    const c = await registeredClient(ctx.base, 'quitter');
    const s1 = (await c.post('/sessions', { gameType: 'make24', difficulty: 'easy' })).data.session;
    const s2 = (await c.post('/sessions', { gameType: 'make24', difficulty: 'easy' })).data.session;
    assert.equal((await c.get(`/sessions/${s1.id}`)).data.session.status, 'abandoned');
    const ab = await c.post(`/sessions/${s2.id}/abandon`);
    assert.equal(ab.data.session.status, 'abandoned');
    assert.equal((await c.post(`/sessions/${s2.id}/answer`, { round: 1, expression: '1+1' })).data.error.code, 'GAME_OVER');
    assert.equal((await c.post(`/sessions/${s2.id}/finish`)).status, 409);
    const stats = (await c.get('/stats/me')).data;
    assert.equal(stats.totals.gamesPlayed, 0);
  });

  test('validates game type and difficulty', async () => {
    const c = await registeredClient(ctx.base, 'validator');
    assert.equal((await c.post('/sessions', { gameType: 'chess', difficulty: 'easy' })).data.error.code, 'INVALID_GAME');
    assert.equal((await c.post('/sessions', { gameType: 'sudoku', difficulty: 'insane' })).data.error.code, 'INVALID_DIFFICULTY');
    assert.equal((await c.post('/sessions', { gameType: '__proto__', difficulty: 'easy' })).data.error.code, 'INVALID_GAME');
    assert.equal((await c.get('/sessions/not-a-real-id')).status, 404);
  });

  async function playFastMath(client, difficulty, correctAnswers) {
    const s = (await client.post('/sessions', { gameType: 'fastmath', difficulty })).data.session;
    for (let round = 1; round <= correctAnswers; round++) {
      const ans = ctx.secretState(s.id).problem.answer;
      await client.post(`/sessions/${s.id}/answer`, { round, answer: ans });
    }
    ctx.advance(60_000);
    return (await client.post(`/sessions/${s.id}/finish`)).data.session;
  }

  test('stats are per player and per difficulty; leaderboard ranks best scores', async () => {
    const p1 = await registeredClient(ctx.base, 'ranker_one');
    const p2 = await registeredClient(ctx.base, 'ranker_two');
    const p3 = await registeredClient(ctx.base, 'ranker_three');

    await playFastMath(p1, 'hard', 3);
    const second = await playFastMath(p1, 'hard', 5);
    assert.equal(second.result.personalBest, true);
    assert.equal(second.result.previousBest, 3);
    const third = await playFastMath(p1, 'hard', 2);
    assert.equal(third.result.personalBest, false);
    await playFastMath(p2, 'hard', 7);
    await playFastMath(p3, 'hard', 0); // zero scores don't make the board
    await playFastMath(p3, 'normal', 4);

    const s1 = (await p1.get('/stats/me')).data;
    assert.equal(s1.games.fastmath.difficulties.hard.gamesPlayed, 3);
    assert.equal(s1.games.fastmath.difficulties.hard.bestScore, 5);
    assert.equal(s1.games.fastmath.difficulties.hard.totalScore, 10);
    assert.equal(s1.games.fastmath.difficulties.normal, null);
    assert.equal(s1.totals.gamesPlayed, 3);
    assert.equal(s1.recent.length, 3);

    const s2 = (await p2.get('/stats/me')).data;
    assert.equal(s2.totals.gamesPlayed, 1);
    assert.equal(s2.totals.totalScore, 7);

    const board = (await p1.get('/leaderboard?game=fastmath&difficulty=hard')).data;
    assert.equal(board.metric, 'score');
    const names = board.entries.map((e) => e.username);
    assert.deepEqual(names.slice(0, 2), ['ranker_two', 'ranker_one']);
    assert.ok(!names.includes('ranker_three'));
    assert.equal(board.entries.find((e) => e.username === 'ranker_one').isMe, true);
    assert.equal(board.me.rank, names.indexOf('ranker_one') + 1);
    assert.equal(board.entries.find((e) => e.username === 'ranker_two').bestScore, 7);

    const normal = (await p3.get('/leaderboard?game=fastmath&difficulty=normal')).data;
    assert.equal(normal.entries.find((e) => e.isMe).bestScore, 4);
  });

  test('history paginates and filters by game', async () => {
    const c = await registeredClient(ctx.base, 'historian');
    for (let i = 0; i < 4; i++) await playFastMath(c, 'easy', i);
    const page1 = (await c.get('/stats/me/history?limit=3')).data;
    assert.equal(page1.items.length, 3);
    assert.equal(page1.total, 4);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.items[0].score, 3, 'newest first');
    const page2 = (await c.get('/stats/me/history?limit=3&offset=3')).data;
    assert.equal(page2.items.length, 1);
    assert.equal(page2.hasMore, false);
    assert.equal((await c.get('/stats/me/history?game=sudoku')).data.total, 0);
  });

  test('sudoku leaderboard ranks fastest time', async () => {
    const solve = async (client, ms) => {
      const s = (await client.post('/sessions', { gameType: 'sudoku', difficulty: 'hard' })).data.session;
      const { puzzle, solution } = ctx.secretState(s.id);
      ctx.advance(ms);
      let last;
      for (let i = 0; i < 81; i++) {
        if (puzzle[i] === '0') last = await client.post(`/sessions/${s.id}/answer`, { cell: i, value: Number(solution[i]) });
      }
      return last.data.session;
    };
    const slow = await registeredClient(ctx.base, 'tortoise');
    const fast = await registeredClient(ctx.base, 'hare');
    await solve(slow, 900_000);
    const hareResult = await solve(fast, 300_000);
    assert.equal(hareResult.result.standing.rank, 1);
    const board = (await slow.get('/leaderboard?game=sudoku&difficulty=hard')).data;
    assert.equal(board.metric, 'time');
    assert.deepEqual(board.entries.map((e) => e.username), ['hare', 'tortoise']);
    assert.equal(board.entries[0].bestTimeMs, 300_000);
    assert.equal(board.me.rank, 2);
  });
});
