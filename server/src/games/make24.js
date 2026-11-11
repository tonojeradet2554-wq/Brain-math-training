/**
 * Make 24: four numbers, + − × ÷ and parentheses, each number used exactly once.
 * Puzzles are drawn from pools built by exhaustively solving every 4-number set,
 * so every puzzle served is guaranteed to have a solution.
 */
import { rational, equals, toString } from './rational.js';
import { parse, evaluate, collectNumbers, format, ExpressionError } from './expression.js';
import { HttpError } from '../http/errors.js';
import { pick, shuffle } from './random.js';
import { MAKE24_POOLS as PRECOMPUTED_POOLS } from './make24-pools.js';

export const TARGET = 24;
const TARGET_Q = rational(TARGET);
const EPS = 1e-9;

/*
 * Human-difficulty cost model. Every operation in a solution adds a cost;
 * the puzzle's difficulty is driven by its *cheapest* solution.
 */
const COST = { add: 1, mul: 1, sub: 1.5, div: 2.5, negative: 3, fraction: 4, large: 1.5 };
const LARGE = 40;

function opCost(base, v) {
  let c = base;
  if (v < -EPS) c += COST.negative;
  if (Math.abs(v - Math.round(v)) > EPS) c += COST.fraction;
  if (Math.abs(v) > LARGE + EPS) c += COST.large;
  return c;
}

/**
 * Exhaustively searches every expression tree for a set of numbers.
 * Returns the raw number of solutions, the cost of the cheapest one, and
 * whether a solution exists that stays on whole, non-negative numbers.
 */
export function analyze(numbers) {
  let count = 0;
  let minCost = Infinity;
  let friendly = false;

  function search(values, costs, whole) {
    const n = values.length;
    if (n === 1) {
      if (Math.abs(values[0] - TARGET) < EPS) {
        count++;
        if (costs[0] < minCost) minCost = costs[0];
        if (whole[0]) friendly = true;
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const restV = [];
        const restC = [];
        const restW = [];
        for (let k = 0; k < n; k++) {
          if (k !== i && k !== j) {
            restV.push(values[k]);
            restC.push(costs[k]);
            restW.push(whole[k]);
          }
        }
        const a = values[i];
        const b = values[j];
        const base = costs[i] + costs[j];
        const w = whole[i] && whole[j];
        const results = [
          [a + b, COST.add],
          [a * b, COST.mul],
          [a - b, COST.sub],
          [b - a, COST.sub],
        ];
        if (Math.abs(b) > EPS) results.push([a / b, COST.div]);
        if (Math.abs(a) > EPS) results.push([b / a, COST.div]);
        for (const [v, c] of results) {
          restV.push(v);
          restC.push(base + opCost(c, v));
          restW.push(w && v > -EPS && Math.abs(v - Math.round(v)) < EPS);
          search(restV, restC, restW);
          restV.pop();
          restC.pop();
          restW.pop();
        }
      }
    }
  }

  search(numbers.slice(), numbers.map(() => 0), numbers.map(() => true));
  if (count === 0) return { solvable: false, count: 0, minCost: null, friendly: false, difficulty: null };

  let difficulty = minCost;
  if (count <= 2) difficulty += 1;
  else if (count <= 5) difficulty += 0.5;
  difficulty += 0.5 * numbers.filter((v) => v >= 10).length;
  return { solvable: true, count, minCost, friendly, difficulty };
}

const OP_BASE_COST = { '+': COST.add, '*': COST.mul, '-': COST.sub, '/': COST.div };

/** Finds the simplest exact solution and returns it formatted, e.g. "8 ÷ (3 − 8 ÷ 3)". */
export function findSolution(numbers) {
  let best = null;
  let bestCost = Infinity;
  const items = numbers.map((v) => ({ q: rational(v), ast: { type: 'num', value: v }, cost: 0 }));

  function search(list) {
    if (list.length === 1) {
      if (equals(list[0].q, TARGET_Q) && list[0].cost < bestCost) {
        bestCost = list[0].cost;
        best = list[0].ast;
      }
      return;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const rest = list.filter((_, k) => k !== i && k !== j);
        const a = list[i];
        const b = list[j];
        for (const op of ['+', '-', '*', '/']) {
          if ((op === '+' || op === '*') && j < i) continue; // commutative: each pair once
          const ast = { type: 'bin', op, left: a.ast, right: b.ast };
          let q;
          try {
            q = evaluate(ast);
          } catch {
            continue; // division by zero
          }
          const cost = a.cost + b.cost + opCost(OP_BASE_COST[op], q.n / q.d);
          if (cost >= bestCost) continue;
          search([...rest, { q, ast, cost }]);
        }
      }
    }
  }

  search(items);
  return best ? format(best) : null;
}

/* ---------- difficulty pools ---------- */

export const DIFFICULTY_RULES = {
  // Numbers 1–9 with a quick solution using + − × only.
  easy: { maxValue: 9, test: (a) => a.difficulty <= 4 },
  // Numbers up to 12; needs a division, a bigger number or a less obvious route.
  normal: { maxValue: 12, test: (a, max) => a.difficulty <= 5.5 && (max >= 10 || a.difficulty > 4) },
  // Numbers up to 13; fractions, negatives, big intermediates or very few solutions.
  hard: { maxValue: 13, test: (a) => a.difficulty > 5.5 },
};

/**
 * Classifies every 4-number set (1–13). Takes ~1 s, so the result is generated
 * ahead of time into make24-pools.js (npm run pools) and a test keeps it in sync.
 */
export function computePools() {
  const built = { easy: [], normal: [], hard: [] };
  for (let a = 1; a <= 13; a++)
    for (let b = a; b <= 13; b++)
      for (let c = b; c <= 13; c++)
        for (let d = c; d <= 13; d++) {
          const set = [a, b, c, d];
          const info = analyze(set);
          if (!info.solvable) continue;
          for (const [level, rule] of Object.entries(DIFFICULTY_RULES)) {
            if (d <= rule.maxValue && rule.test(info, d)) built[level].push(set);
          }
        }
  return built;
}

/** Precomputed pools (instant on serverless cold starts). */
export const getPools = () => PRECOMPUTED_POOLS;

const keyOf = (numbers) => numbers.slice().sort((x, y) => x - y).join(',');

export function nextPuzzle(difficulty, rng, recentKeys = []) {
  const pool = getPools()[difficulty];
  const recent = new Set(recentKeys);
  let set = pick(rng, pool);
  for (let tries = 0; tries < 20 && recent.has(keyOf(set)); tries++) set = pick(rng, pool);
  return shuffle(rng, set);
}

/* ---------- answer checking ---------- */

export function checkAnswer(numbers, expression) {
  let ast;
  try {
    ast = parse(expression);
  } catch (err) {
    if (err instanceof ExpressionError) {
      return { correct: false, reason: 'syntax', detail: err.key, params: err.params, message: err.message };
    }
    throw err;
  }

  const used = collectNumbers(ast).sort((x, y) => x - y);
  const expected = numbers.slice().sort((x, y) => x - y);
  const sameNumbers = used.length === expected.length && used.every((v, i) => v === expected[i]);
  if (!sameNumbers) {
    const stray = used.find((v) => !expected.includes(v));
    if (stray !== undefined) {
      return { correct: false, reason: 'numbers', detail: 'stray', number: stray, message: `${stray} isn’t one of your numbers.` };
    }
    if (used.length < expected.length) {
      return { correct: false, reason: 'numbers', detail: 'missing', message: 'Use all four numbers.' };
    }
    return { correct: false, reason: 'numbers', detail: 'reuse', message: 'Use each of the four numbers exactly once.' };
  }

  let value;
  try {
    value = evaluate(ast);
  } catch (err) {
    if (err instanceof ExpressionError) return { correct: false, reason: 'math', detail: err.key, message: err.message };
    throw err;
  }
  if (!equals(value, TARGET_Q)) {
    return {
      correct: false,
      reason: 'value',
      value: toString(value),
      message: `That makes ${toString(value)}, not 24. Try again.`,
    };
  }
  return { correct: true, expression: format(ast) };
}

/* ---------- game module interface ---------- */

const RECENT_LIMIT = 12;

export const make24Game = {
  id: 'make24',
  timed: true,
  durationMs: 180_000,
  metric: 'score',

  createState(difficulty, rng) {
    const numbers = nextPuzzle(difficulty, rng);
    return { numbers, round: 1, recent: [keyOf(numbers)], solved: [] };
  },

  publicState(state) {
    return { numbers: state.numbers, round: state.round, target: TARGET };
  },

  applyAnswer(state, body, { difficulty, rng }) {
    const { round, expression } = body;
    if (!Number.isInteger(round)) throw new HttpError(400, 'BAD_REQUEST', 'round is required');
    if (typeof expression !== 'string') throw new HttpError(400, 'BAD_REQUEST', 'expression is required');
    if (round !== state.round) return { stale: true };

    const verdict = checkAnswer(state.numbers, expression);
    if (!verdict.correct) {
      return {
        correct: false,
        state,
        feedback: {
          message: verdict.message,
          reason: verdict.reason,
          detail: verdict.detail ?? null,
          params: verdict.params ?? null,
          number: verdict.number ?? null,
          value: verdict.value ?? null,
        },
      };
    }

    const numbers = nextPuzzle(difficulty, rng, state.recent);
    const next = {
      numbers,
      round: state.round + 1,
      recent: [...state.recent, keyOf(numbers)].slice(-RECENT_LIMIT),
      solved: [...state.solved, { numbers: state.numbers, expression: verdict.expression }].slice(-50),
    };
    return {
      correct: true,
      scoreDelta: 1,
      state: next,
      feedback: { message: 'Correct!', expression: verdict.expression },
    };
  },

  resultDetails(state) {
    return {
      solved: state.solved.slice(-10),
      lastPuzzle: { numbers: state.numbers, solution: findSolution(state.numbers) },
    };
  },
};
