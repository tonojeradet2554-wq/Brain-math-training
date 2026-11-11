import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowed,
  canAppend,
  isComplete,
  missingHint,
  toExpression,
  keyToToken,
} from '../src/games/make24/expressionBuilder.js';
import { isPeer, move, digitCounts, clearNotesAfterPlacement, firstEmpty } from '../src/games/sudoku/sudokuHelpers.js';
import { formatClock, formatCountdown } from '../src/utils/format.js';

const num = (value, card) => ({ type: 'num', value, card });
const op = (value) => ({ type: 'op', value });

describe('make 24 expression builder', () => {
  test('only allows grammatical next tokens', () => {
    assert.deepEqual(allowed([]), { number: true, open: true, operator: false, close: false });
    assert.deepEqual(allowed([num(8, 0)]), { number: false, open: false, operator: true, close: false });
    assert.deepEqual(allowed([{ type: '(' }, num(8, 0)]), { number: false, open: false, operator: true, close: true });
    assert.equal(canAppend([num(8, 0)], num(3, 1)), false, 'no implicit concatenation');
    assert.equal(canAppend([op('+')], op('*')), false, 'no double operators');
    assert.equal(canAppend([], { type: ')' }), false);
  });

  test('is complete only with every card, balanced parens and a final operand', () => {
    const tokens = [num(8, 0), op('/'), { type: '(' }, num(3, 1), op('-'), num(8, 2), op('/'), num(3, 3), { type: ')' }];
    assert.equal(isComplete(tokens, 4), true);
    assert.equal(toExpression(tokens), '8 / ( 3 - 8 / 3 )');
    assert.equal(isComplete(tokens.slice(0, -1), 4), false);
    assert.deepEqual(missingHint(tokens.slice(0, -1), 4), { key: 'make24.hint.close', params: { count: 1 } });
    assert.deepEqual(missingHint([num(1, 0)], 4), { key: 'make24.hint.useMore', params: { count: 3 } });
    assert.equal(missingHint(tokens, 4), null);
  });

  test('maps keyboard keys to tokens', () => {
    assert.deepEqual(keyToToken('x'), op('*'));
    assert.deepEqual(keyToToken('/'), op('/'));
    assert.deepEqual(keyToToken('('), { type: '(' });
    assert.equal(keyToToken('a'), null);
  });
});

describe('sudoku helpers', () => {
  test('peers share a row, column or box', () => {
    assert.equal(isPeer(0, 8), true); // same row
    assert.equal(isPeer(0, 72), true); // same column
    assert.equal(isPeer(0, 20), true); // same box
    assert.equal(isPeer(0, 30), false);
    assert.equal(isPeer(5, 5), false);
  });

  test('arrow movement wraps around the grid', () => {
    assert.equal(move(0, 'ArrowLeft'), 8);
    assert.equal(move(0, 'ArrowUp'), 72);
    assert.equal(move(80, 'ArrowRight'), 72);
    assert.equal(move(80, 'ArrowDown'), 8);
  });

  test('digit counts and notes cleanup', () => {
    const board = '1'.repeat(9) + '0'.repeat(72);
    assert.equal(digitCounts(board)[1], 9);
    assert.equal(firstEmpty(board), 9);
    const notes = { 1: (1 << 5) | (1 << 3), 40: 1 << 5 };
    const next = clearNotesAfterPlacement(notes, 0, 5);
    assert.equal(next[1], 1 << 3, 'peer loses the placed digit');
    assert.equal(next[40], 1 << 5, 'non-peer keeps it');
  });
});

describe('formatting', () => {
  test('clock and countdown', () => {
    assert.equal(formatClock(83_000), '1:23');
    assert.equal(formatClock(3_723_000), '1:02:03');
    assert.equal(formatCountdown(59_001), '1:00', 'rounds up so 0:00 means time is up');
    assert.equal(formatCountdown(0), '0:00');
  });
});
