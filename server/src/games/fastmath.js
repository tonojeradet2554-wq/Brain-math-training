/**
 * Fast Math: 60-second sprint of mostly addition / subtraction problems.
 * Answers are always whole numbers ≥ 0.
 */
import { HttpError } from '../http/errors.js';
import { randInt } from './random.js';

const MINUS = '−';

/** a ± b ± c ... keeping every running total ≥ 0. */
function chain(rng, terms, min, max) {
  let total = randInt(rng, min, max);
  const parts = [String(total)];
  for (let t = 1; t < terms; t++) {
    let n = randInt(rng, min, max);
    const subtract = rng() < 0.5;
    if (subtract && t === 1 && n > total) {
      // Swap the first pair so "small − big" becomes "big − small".
      [total, n] = [n, total];
      parts[0] = String(total);
    }
    if (subtract && n <= total) {
      total -= n;
      parts.push(MINUS, String(n));
    } else {
      total += n;
      parts.push('+', String(n));
    }
  }
  return { text: parts.join(' '), answer: total };
}

/** "? + b = c" or "a − ? = c". */
function missing(rng, min, max) {
  const a = randInt(rng, min, max);
  const b = randInt(rng, min, max);
  if (rng() < 0.5) return { text: `? + ${b} = ${a + b}`, answer: a };
  const [big, small] = a >= b ? [a, b] : [b, a];
  return { text: `${big} ${MINUS} ? = ${big - small}`, answer: small };
}

const GENERATORS = {
  // Single-step, numbers up to 20.
  easy: (rng) => chain(rng, 2, 1, 20),
  // Two-digit numbers, some three-term chains and missing numbers.
  normal: (rng) => {
    const roll = rng();
    if (roll < 0.5) return chain(rng, 2, 10, 99);
    if (roll < 0.85) return chain(rng, 3, 5, 50);
    return missing(rng, 10, 99);
  },
  // Three-digit numbers, longer chains, missing numbers, the odd quick product.
  hard: (rng) => {
    const roll = rng();
    if (roll < 0.35) return chain(rng, 3, 100, 999);
    if (roll < 0.55) return chain(rng, 4, 12, 99);
    if (roll < 0.75) return missing(rng, 100, 999);
    if (roll < 0.9) return chain(rng, 2, 250, 1999);
    const a = randInt(rng, 12, 49);
    const b = randInt(rng, 3, 9);
    return { text: `${a} × ${b}`, answer: a * b };
  },
};

export function generateProblem(difficulty, rng, previousText = null) {
  const gen = GENERATORS[difficulty];
  if (!gen) throw new Error(`Unknown difficulty ${difficulty}`);
  let problem = gen(rng);
  for (let i = 0; i < 5 && problem.text === previousText; i++) problem = gen(rng);
  return problem;
}

export const fastMathGame = {
  id: 'fastmath',
  timed: true,
  durationMs: 60_000,
  metric: 'score',

  createState(difficulty, rng) {
    return { problem: generateProblem(difficulty, rng), round: 1, history: [] };
  },

  publicState(state) {
    return { problem: { text: state.problem.text }, round: state.round };
  },

  applyAnswer(state, body, { difficulty, rng }) {
    const { round, answer } = body;
    if (!Number.isInteger(round)) throw new HttpError(400, 'BAD_REQUEST', 'round is required');
    if (!Number.isSafeInteger(answer)) throw new HttpError(400, 'BAD_REQUEST', 'Answer must be a whole number');
    if (round !== state.round) return { stale: true };

    if (answer !== state.problem.answer) {
      return { correct: false, state, feedback: { message: 'Not quite — try again.' } };
    }
    const next = {
      problem: generateProblem(difficulty, rng, state.problem.text),
      round: state.round + 1,
      history: [...state.history, state.problem].slice(-100),
    };
    return { correct: true, scoreDelta: 1, state: next, feedback: { message: 'Correct!' } };
  },

  resultDetails(state) {
    return { solved: state.history.slice(-10), lastProblem: state.problem };
  },
};
