/**
 * Structural metadata for each game. All player-facing text (names, rules,
 * difficulty descriptions) lives in i18n/messages.js under games.<id>.
 * Rules and scoring are enforced by the server.
 */
export const GAMES = {
  sudoku: { id: 'sudoku', metric: 'time' },
  make24: { id: 'make24', metric: 'score' },
  fastmath: { id: 'fastmath', metric: 'score' },
};

export const GAME_ORDER = ['sudoku', 'make24', 'fastmath'];

export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export const isDifficulty = (id) => DIFFICULTIES.includes(id);
