import { HttpError } from '../http/errors.js';
import { sudokuGame } from './sudoku.js';
import { make24Game } from './make24.js';
import { fastMathGame } from './fastmath.js';

/**
 * Every game implements the same interface:
 *   id, timed, durationMs, metric ('score' | 'time')
 *   createState(difficulty, rng)          -> secret server state
 *   publicState(state)                    -> what the client may see
 *   applyAnswer(state, body, ctx)         -> { correct, scoreDelta, completed?, stale?, state, feedback }
 *   resultDetails(state)                  -> extra data stored with the result
 */
export const GAMES = {
  sudoku: sudokuGame,
  make24: make24Game,
  fastmath: fastMathGame,
};

export const GAME_TYPES = Object.keys(GAMES);
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function getGame(gameType) {
  const game = Object.hasOwn(GAMES, gameType) ? GAMES[gameType] : null;
  if (!game) throw new HttpError(400, 'INVALID_GAME', 'Unknown game type');
  return game;
}

export function assertDifficulty(difficulty) {
  if (!DIFFICULTIES.includes(difficulty)) throw new HttpError(400, 'INVALID_DIFFICULTY', 'Difficulty must be easy, normal or hard');
  return difficulty;
}
