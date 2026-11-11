/**
 * Sudoku: generator + uniqueness-checking solver using bitmasks.
 * Boards are 81-char strings, row-major, '0' = empty.
 * The solution never leaves the server; each placement is checked here.
 */
import { HttpError } from '../http/errors.js';
import { shuffle } from './random.js';

const ROW = new Int8Array(81);
const COL = new Int8Array(81);
const BOX = new Int8Array(81);
for (let i = 0; i < 81; i++) {
  ROW[i] = Math.floor(i / 9);
  COL[i] = i % 9;
  BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0x3fe; // bits 1..9

function popcount(x) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** Builds row/col/box masks; returns null if the givens already conflict. */
function masksFor(grid) {
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return null;
    rows[ROW[i]] |= bit;
    cols[COL[i]] |= bit;
    boxes[BOX[i]] |= bit;
  }
  return { rows, cols, boxes };
}

/** Counts solutions up to `limit` (2 is enough to prove uniqueness). */
export function countSolutions(input, limit = 2) {
  const grid = Array.from(input, Number);
  const masks = masksFor(grid);
  if (!masks) return 0;
  const { rows, cols, boxes } = masks;
  let count = 0;

  function search() {
    let best = -1;
    let bestCand = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const cand = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const n = popcount(cand);
      if (n === 0) return; // dead end
      if (n < bestCount) {
        best = i;
        bestCand = cand;
        bestCount = n;
        if (n === 1) break;
      }
    }
    if (best === -1) {
      count++;
      return;
    }
    const r = ROW[best];
    const c = COL[best];
    const b = BOX[best];
    for (let v = 1; v <= 9 && count < limit; v++) {
      const bit = 1 << v;
      if (!(bestCand & bit)) continue;
      grid[best] = v;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      search();
      grid[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
  }

  search();
  return count;
}

/** Produces a random, fully solved, valid grid. */
export function generateSolution(rng) {
  const grid = new Array(81).fill(0);
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);

  function fill(i) {
    if (i === 81) return true;
    const r = ROW[i];
    const c = COL[i];
    const b = BOX[i];
    for (const v of shuffle(rng, DIGITS)) {
      const bit = 1 << v;
      if ((rows[r] | cols[c] | boxes[b]) & bit) continue;
      grid[i] = v;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (fill(i + 1)) return true;
      grid[i] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    return false;
  }

  fill(0);
  return grid;
}

export const BLANKS = { easy: 38, normal: 47, hard: 54 };

/**
 * Removes clues in symmetric pairs while the puzzle keeps exactly one solution.
 * Returns { puzzle, solution } as 81-char strings.
 */
export function generatePuzzle(difficulty, rng) {
  const target = BLANKS[difficulty];
  if (!target) throw new Error(`Unknown difficulty ${difficulty}`);
  let best = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const solution = generateSolution(rng);
    const puzzle = solution.slice();
    let blanks = 0;
    for (const i of shuffle(rng, [...Array(41).keys()])) {
      const cells = i === 40 ? [40] : [i, 80 - i];
      if (blanks + cells.length > target) continue;
      const saved = cells.map((k) => puzzle[k]);
      for (const k of cells) puzzle[k] = 0;
      if (countSolutions(puzzle, 2) === 1) blanks += cells.length;
      else cells.forEach((k, n) => (puzzle[k] = saved[n]));
      if (blanks === target) break;
    }
    if (!best || blanks > best.blanks) best = { puzzle, solution, blanks };
    if (blanks >= target - 1) break;
  }

  return { puzzle: best.puzzle.join(''), solution: best.solution.join('') };
}

export function isValidSolution(board) {
  if (typeof board !== 'string' || board.length !== 81 || board.includes('0')) return false;
  return masksFor(Array.from(board, Number)) !== null;
}

/* ---------- game module interface ---------- */

const countBlanks = (s) => s.split('').filter((ch) => ch === '0').length;

export const sudokuGame = {
  id: 'sudoku',
  timed: false,
  durationMs: null,
  metric: 'time',

  createState(difficulty, rng) {
    const { puzzle, solution } = generatePuzzle(difficulty, rng);
    return { puzzle, solution, board: puzzle, blanks: countBlanks(puzzle), filled: 0 };
  },

  /** Never includes the solution. */
  publicState(state) {
    return { puzzle: state.puzzle, board: state.board, blanks: state.blanks, filled: state.filled };
  },

  applyAnswer(state, body) {
    const { cell, value } = body;
    if (!Number.isInteger(cell) || cell < 0 || cell > 80) throw new HttpError(400, 'BAD_REQUEST', 'cell must be 0–80');
    if (!Number.isInteger(value) || value < 1 || value > 9) throw new HttpError(400, 'BAD_REQUEST', 'value must be 1–9');
    if (state.puzzle[cell] !== '0') throw new HttpError(400, 'FIXED_CELL', 'That cell is part of the puzzle');
    if (state.board[cell] !== '0') throw new HttpError(409, 'ALREADY_FILLED', 'That cell is already solved');

    if (state.solution[cell] !== String(value)) {
      return {
        correct: false,
        state,
        feedback: { cell, value, message: `${value} doesn’t belong there. Try another number.` },
      };
    }

    const board = state.board.slice(0, cell) + value + state.board.slice(cell + 1);
    const filled = state.filled + 1;
    return {
      correct: true,
      scoreDelta: 1,
      completed: filled === state.blanks,
      state: { ...state, board, filled },
      feedback: { cell, value },
    };
  },

  resultDetails(state) {
    return { blanks: state.blanks, filled: state.filled, puzzle: state.puzzle, solution: state.board };
  },
};
