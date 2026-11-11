# Cortex — Brain Training Platform

Three brain-training games — **Sudoku**, **Make 24** and **Fast Math** — with accounts, server-checked scoring, personal statistics and leaderboards.

> **ภาษาไทยโดยย่อ:** เว็บเกมฝึกสมอง 3 เกม (Sudoku, Make 24, Fast Math) มีระบบสมาชิก (สมัคร/เข้าสู่ระบบ/ออกจากระบบ) ฐานข้อมูล SQLite จริง ระบบจับเวลา ระบบคะแนน สถิติส่วนตัว และ Leaderboard Top 10 แยกตามเกมและระดับความยาก
> เซิร์ฟเวอร์เป็นผู้สร้างโจทย์ เก็บเฉลย ตรวจคำตอบ และจับเวลาเองทั้งหมด ฝั่งเบราว์เซอร์จึงโกงคะแนนไม่ได้
> หน้าเว็บเป็นภาษาไทยโดยค่าเริ่มต้น สลับเป็นภาษาอังกฤษได้ด้วยปุ่ม ไทย | EN ที่มุมขวาบน
> รันด้วย `npm install` แล้ว `npm run dev` จากนั้นเปิด http://localhost:3001

## Quick start

Requires **Node.js 20.19+**.

```bash
npm install
npm run dev        # http://localhost:3001 — API + React app with hot reload, one port
```

Production:

```bash
npm run build      # builds the React app into client/dist
npm start          # Express serves the API and the built app on http://localhost:3001
```

Tests:

```bash
npm test           # 37 server tests (game logic + full HTTP API) and 13 client tests (game helpers + i18n)
```

Configuration (environment variables, all optional locally): `PORT` (default `3001`), `DB_PATH` (default `server/data/cortex.db`), `COOKIE_SECURE=true` when served over HTTPS, `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` to use a hosted Turso database instead of the local file. Delete `server/data/` to reset local data.

## Deploy for free (Vercel + Turso)

Vercel runs the API as serverless functions, which can't keep files, so production data lives in **Turso** (hosted SQLite, free plan). Locally nothing changes; the app still uses the `server/data/cortex.db` file.

**1. Create the database (Turso)**
1. Sign up at https://turso.tech (you can sign in with GitHub).
2. Create a database, e.g. `cortex`, in a region close to your players (e.g. Singapore for Thailand).
3. On the database page, copy the **Database URL**. It starts with `libsql://`.
4. Create a **token** for that database (read & write) and copy it.

The tables are created automatically on the first request.

**2. Deploy (Vercel)**
1. Sign in at https://vercel.com with your GitHub account.
2. **Add New → Project →** import the `Brain-math-training` repository. Leave the build settings alone; `vercel.json` already sets them.
3. Under **Environment Variables** add:
   - `TURSO_DATABASE_URL` = the `libsql://…` URL
   - `TURSO_AUTH_TOKEN` = the token
4. Click **Deploy**. Your game will be live at `https://<project-name>.vercel.app`.

Every push to `main` redeploys automatically. If you add the variables after the first deploy, use **Deployments → Redeploy** so they take effect.

How it fits together: `vercel.json` serves the built React app from `client/dist`, sends `/api/*` to `api/index.js` (the same Express app as local), and falls back to `index.html` for page routes. On Vercel, cookies are automatically `Secure`.

Known limit: the login and sign-up rate limits are kept in memory, so on Vercel they apply per server instance rather than globally.

## Stack

| Layer    | Choice                                                                      |
| -------- | --------------------------------------------------------------------------- |
| Server   | Node.js, Express 5, Helmet                                                  |
| Database | SQLite via libSQL: a local file in development, Turso when hosted           |
| Hosting  | Vercel (static app + one serverless function), or any Node host            |
| Auth     | scrypt password hashes, random session tokens in HttpOnly SameSite cookies |
| Client   | React 19, React Router 7, Vite, plain CSS design tokens, lucide icons      |

## How the games work

| Game      | Round                         | Scoring                                     | Leaderboard ranks by |
| --------- | ----------------------------- | ------------------------------------------- | -------------------- |
| Sudoku    | Stopwatch until solved        | +1 per correct cell, recorded when solved   | Fastest solve time   |
| Make 24   | 3-minute timed round          | +1 per solved set, new set dealt instantly  | Best round score     |
| Fast Math | 60-second timed round         | +1 per correct answer, next problem at once | Best round score     |

Wrong answers never score and keep the same question until it is answered correctly. In timed games the clock keeps running regardless.

**Difficulty**

- **Sudoku:** Easy ≈ 43 clues, Normal ≈ 34, Hard ≈ 27. Every puzzle is generated on the server and verified to have exactly one solution.
- **Make 24:** all 1,820 four-number sets (1–13) are solved exhaustively at startup. Each set gets a difficulty from its *simplest* solution (division, negative or fractional steps and big intermediate numbers cost more, as do sets with very few solutions). Easy uses 1–9 with quick + − × routes; Hard includes fraction puzzles such as `3 3 8 8`. Every served puzzle is guaranteed solvable.
- **Fast Math:** Easy is single-step up to 20; Normal uses two-digit numbers and short chains; Hard uses three-digit numbers, missing-number problems (`? + 278 = 693`) and the occasional quick product.

**Design decisions worth knowing**

- Make 24 had no timer in the brief. It uses a 3-minute round so the leaderboard compares like with like. Change `durationMs` in `server/src/games/make24.js` to adjust it.
- "End round" in timed games saves the score so far. Leaving a timed round (with confirmation) abandons it, and abandoned rounds aren't recorded.
- A Sudoku in progress is saved on the server: leave any time and use **Continue** on the Sudoku page. Unsolved puzzles (Give up) aren't recorded.
- Pencil-mark notes in Sudoku are client-only and never count as answers.

## Languages (Thai / English)

The interface is **Thai by default**, with an instant **ไทย | EN** switch in the header and on the sign-in pages. The choice is remembered in `localStorage`.

- All text lives in `client/src/i18n/messages.js`. A test fails if the Thai and English dictionaries ever have different keys, or if a Thai string is left with an unfilled `{placeholder}`.
- The server sends machine-readable details with its errors and feedback (`code`, `field` + `rule`, rate-limit `scope`, Make 24 `reason` + `detail`). The client translates them, so server messages appear in the player's language and re-translate if they switch mid-screen.
- Thai uses Noto Sans Thai (bundled, about 27 kB, loaded only when Thai text is shown) next to Inter, with taller line height and no letter-spacing. Dates use the Thai Buddhist calendar (e.g. `11 พ.ย. 2569`), and relative times read like `5 นาทีที่ผ่านมา`.
- To add a language, add a dictionary with the same shape to `messages.js` and its id to `LANGUAGES`.

## Integrity and security

- **The server is authoritative.** It generates every puzzle, keeps solutions and answers in `game_sessions.state`, checks every answer and owns the clock. The client only ever gets a public view.
- **Make 24 answers** go through a dedicated parser that uses exact fraction arithmetic and never `eval`. It checks that the four given numbers are each used exactly once, with no digit concatenation and no unary minus.
- **No double scoring.** Each answer carries the round number, so a repeated or late submit for an already-solved round gets `409 STALE_ROUND`. Writes also use the attempt count as an optimistic lock, and the client blocks resubmits while a request is in flight.
- **No double saves, even across many server instances.** Finishing is a single atomic batch: claim the session (`status = 'active'` guard), insert the result only if the session is completed (`game_results.session_id` is `UNIQUE`), and update the stats only if that insert happened (`changes() = 1`). Answer writes use the attempt count as an optimistic lock and are re-checked on a collision.
- **Timers.** Deadlines are set and enforced on the server, with a 750 ms grace window for network latency, so time used is capped at the round length. The client syncs its offset to the server clock and clears every timer on unmount.
- **Auth.** Passwords are hashed with salted scrypt. Session tokens are 256-bit random values, and only their SHA-256 hash is stored. Logout deletes the server-side session. Login always runs scrypt (so usernames can't be probed by timing) and returns a generic error. Login, sign-up and game starts are rate limited.
- **CSRF and headers.** Mutating requests must be JSON, and cookies are `SameSite=Lax`. Helmet sets the CSP and security headers in production.
- **Isolation.** Every session query is scoped to the signed-in user, so another player's game returns 404.

## Project structure

```
server/
  src/
    app.js                 Express app factory (DB, clock and RNG are injected → testable)
    index.js               Boot: DB, Vite middleware in dev / static files in prod
    db.js                  Schema + transaction helper
    games/                 Pure game logic — no Express, no DB
      sudoku.js            Generator + bitmask uniqueness solver
      make24.js            Exhaustive solver, difficulty pools, answer checking
      expression.js        Safe expression parser / evaluator / formatter
      rational.js          Exact fractions
      fastmath.js          Problem generator
      registry.js          Common game interface
    services/              gameService (session lifecycle), stats, leaderboard
    routes/                auth, sessions, stats + leaderboard
    http/                  errors, auth middleware, rate limiter, JSON guard
    security/              scrypt hashing, session tokens
  test/                    node:test suites (unit + HTTP integration)
client/
  src/
    pages/                 Login, Register, Dashboard, GameSetup, GamePlay, Result, Stats, Leaderboard
    games/                 Sudoku / Make 24 / Fast Math UIs + pure helpers, shared session hook
    components/            App shell, dialogs, states (loading / empty / error), controls, icons
    i18n/                  Thai + English dictionaries, translate / format / error helpers, provider
    api/, auth/, hooks/    Fetch client, auth context + route guards, async + clock hooks
    styles/                Design tokens (light + dark), per-feature CSS
  test/                    Client logic tests
```

## API

All endpoints are under `/api`. Everything except `/auth/*` and `/health` requires a session.

| Method | Path                                    | Purpose                                             |
| ------ | --------------------------------------- | --------------------------------------------------- |
| POST   | `/auth/register` · `/auth/login`        | `{ username, password }` → sets the session cookie  |
| POST   | `/auth/logout`                          | Ends the session                                    |
| GET    | `/auth/me`                              | Current user or `null`                              |
| POST   | `/sessions`                             | `{ gameType, difficulty }` → starts a game          |
| GET    | `/sessions/active?gameType=sudoku`      | Resumable game, if any                              |
| GET    | `/sessions/:id`                         | Public game state, or its result once finished      |
| POST   | `/sessions/:id/answer`                  | Sudoku `{ cell, value }` · Make 24 `{ round, expression }` · Fast Math `{ round, answer }` |
| POST   | `/sessions/:id/finish`                  | End a timed round and save it (idempotent)          |
| POST   | `/sessions/:id/abandon`                 | Leave without saving                                |
| GET    | `/stats/me`                             | Totals, per-game and per-difficulty stats, recent games |
| GET    | `/stats/me/history?game=&limit=&offset=`| Paginated play history                              |
| GET    | `/leaderboard?game=&difficulty=`        | Top 10 plus your own position                       |

Data recorded for every finished game: user (username), game type, difficulty, score, time used, attempts, mistakes, date played and personal-best flag. Per player, game and difficulty it also keeps games played, total score, best score, best time, total time and accuracy.
