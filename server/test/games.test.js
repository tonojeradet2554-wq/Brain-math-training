import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluate, collectNumbers, format, ExpressionError } from '../src/games/expression.js';
import { toString } from '../src/games/rational.js';
import { analyze, checkAnswer, findSolution, getPools, nextPuzzle, DIFFICULTY_RULES } from '../src/games/make24.js';
import { countSolutions, generatePuzzle, isValidSolution, BLANKS, sudokuGame } from '../src/games/sudoku.js';
import { generateProblem, fastMathGame } from '../src/games/fastmath.js';
import { seededRng } from '../src/games/random.js';

const value = (expr) => toString(evaluate(parse(expr)));

describe('expression parser', () => {
  test('evaluates with correct precedence and exact fractions', () => {
    assert.equal(value('1 + 2 * 3'), '7');
    assert.equal(value('(1 + 2) * 3'), '9');
    assert.equal(value('8 / (3 - 8 / 3)'), '24');
    assert.equal(value('10 - 4 - 3'), '3');
    assert.equal(value('2 / 4'), '1/2');
  });

  test('accepts pretty operator symbols', () => {
    assert.equal(value('6 × (5 − 1) ÷ 1'), '24');
    assert.equal(value('2x3x4'), '24');
  });

  test('rejects malformed input', () => {
    for (const bad of ['', '1 +', '(1 + 2', '1 + 2)', '1 ++ 2', '-1 + 25', '2 (3)', '1 ^ 2', 'eval(1)', '2 3']) {
      assert.throws(() => parse(bad), ExpressionError, `should reject ${JSON.stringify(bad)}`);
    }
  });

  test('rejects division by zero and over-long input', () => {
    assert.throws(() => evaluate(parse('4 / (2 - 2)')), ExpressionError);
    assert.throws(() => parse('1+'.repeat(80) + '1'), ExpressionError);
  });

  test('collects numbers and formats with minimal parentheses', () => {
    const ast = parse('((8)) / (3 - (8 / 3))');
    assert.deepEqual(collectNumbers(ast), [8, 3, 8, 3]);
    assert.equal(format(ast), '8 ÷ (3 − 8 ÷ 3)');
    assert.equal(format(parse('(1 + 2) + (3 - 4)')), '1 + 2 + 3 − 4');
    assert.equal(format(parse('1 - (2 + 3)')), '1 − (2 + 3)');
  });
});

describe('make 24', () => {
  test('checkAnswer requires all four numbers exactly once', () => {
    assert.equal(checkAnswer([3, 3, 8, 8], '8/(3-8/3)').correct, true);
    assert.equal(checkAnswer([1, 2, 3, 4], '1*2*3*4').correct, true);
    assert.equal(checkAnswer([1, 2, 3, 4], '2*3*4').reason, 'numbers'); // missing 1
    assert.equal(checkAnswer([1, 2, 3, 4], '12*2').reason, 'numbers'); // concatenation
    assert.equal(checkAnswer([1, 2, 3, 4], '4*3*2*1*1').reason, 'numbers'); // reuse
    const wrong = checkAnswer([1, 2, 3, 4], '1+2+3+4');
    assert.equal(wrong.correct, false);
    assert.equal(wrong.value, '10');
    assert.equal(checkAnswer([1, 2, 3, 4], '1+').reason, 'syntax');
    // Machine-readable details let the client explain the problem in any language.
    assert.equal(checkAnswer([1, 2, 3, 4], '2*3*4').detail, 'missing');
    assert.equal(checkAnswer([1, 2, 3, 4], '4*3*2*1*1').detail, 'reuse');
    assert.equal(checkAnswer([1, 2, 3, 4], '12*2').detail, 'stray');
    assert.equal(checkAnswer([1, 2, 3, 4], '(1+2').detail, 'missing_close');
    assert.equal(checkAnswer([2, 2, 3, 4], '4/(2-2)*3').detail, 'div_zero');
  });

  test('unsolvable sets are detected', () => {
    assert.equal(analyze([1, 1, 1, 1]).solvable, false);
    assert.equal(analyze([13, 13, 13, 13]).solvable, false);
    assert.equal(findSolution([1, 1, 1, 1]), null);
  });

  test('every pooled puzzle is solvable, in range, and its solution checks out', () => {
    const pools = getPools();
    for (const [level, pool] of Object.entries(pools)) {
      assert.ok(pool.length >= 100, `${level} pool should be large (${pool.length})`);
      for (const set of pool) {
        assert.ok(Math.max(...set) <= DIFFICULTY_RULES[level].maxValue);
      }
    }
    const rng = seededRng(3);
    for (const level of Object.keys(pools)) {
      for (let i = 0; i < 25; i++) {
        const numbers = nextPuzzle(level, rng);
        const solution = findSolution(numbers);
        assert.ok(solution, `no solution for ${numbers}`);
        assert.equal(checkAnswer(numbers, solution).correct, true, `${numbers}: ${solution}`);
      }
    }
  });

  test('easy pool uses only 1–9, hard pool contains classic fraction puzzles', () => {
    const { easy, hard } = getPools();
    assert.ok(easy.every((s) => s.every((n) => n <= 9)));
    const key = (s) => s.join(',');
    const hardKeys = new Set(hard.map(key));
    assert.ok(hardKeys.has('3,3,8,8'));
    assert.ok(hardKeys.has('1,5,5,5'));
    assert.ok(!new Set(easy.map(key)).has('3,3,8,8'));
  });
});

describe('sudoku', () => {
  test('generated puzzles have a unique, valid solution consistent with the clues', () => {
    const rng = seededRng(11);
    for (const level of ['easy', 'normal', 'hard']) {
      for (let i = 0; i < 4; i++) {
        const { puzzle, solution } = generatePuzzle(level, rng);
        assert.equal(puzzle.length, 81);
        assert.ok(isValidSolution(solution));
        assert.equal(countSolutions(puzzle, 2), 1);
        for (let c = 0; c < 81; c++) if (puzzle[c] !== '0') assert.equal(puzzle[c], solution[c]);
        const blanks = [...puzzle].filter((ch) => ch === '0').length;
        assert.ok(blanks >= BLANKS[level] - 3 && blanks <= BLANKS[level], `${level}: ${blanks} blanks`);
      }
    }
  });

  test('public state never exposes the solution', () => {
    const state = sudokuGame.createState('normal', seededRng(5));
    const pub = sudokuGame.publicState(state);
    assert.equal(pub.solution, undefined);
    assert.ok(!JSON.stringify(pub).includes(state.solution));
  });

  test('harder levels have fewer clues', () => {
    assert.ok(BLANKS.easy < BLANKS.normal && BLANKS.normal < BLANKS.hard);
  });
});

describe('fast math', () => {
  // Independent reference evaluator for "a + b − c" chains and "a × b".
  const evaluateProblem = (text) => {
    if (text.includes('?')) return null;
    const tokens = text.split(' ');
    if (tokens[1] === '×') return Number(tokens[0]) * Number(tokens[2]);
    let total = Number(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      total = tokens[i] === '+' ? total + Number(tokens[i + 1]) : total - Number(tokens[i + 1]);
    }
    return total;
  };

  test('answers are correct whole numbers ≥ 0', () => {
    const rng = seededRng(9);
    for (const level of ['easy', 'normal', 'hard']) {
      for (let i = 0; i < 300; i++) {
        const { text, answer } = generateProblem(level, rng);
        assert.ok(Number.isInteger(answer) && answer >= 0, `${text} = ${answer}`);
        const computed = evaluateProblem(text);
        if (computed !== null) assert.equal(computed, answer, text);
        else {
          // "? + b = c" or "a − ? = c": substitute the answer back in
          const [lhs, rhs] = text.split(' = ');
          assert.equal(evaluateProblem(lhs.replace('?', String(answer))), Number(rhs), text);
        }
      }
    }
  });

  test('easy uses small numbers, hard uses big ones', () => {
    const rng = seededRng(1);
    const maxNumber = (level) => {
      let max = 0;
      for (let i = 0; i < 200; i++) {
        for (const n of generateProblem(level, rng).text.match(/\d+/g)) max = Math.max(max, Number(n));
      }
      return max;
    };
    assert.ok(maxNumber('easy') <= 40);
    assert.ok(maxNumber('hard') >= 500);
  });

  test('public state hides the answer', () => {
    const state = fastMathGame.createState('easy', seededRng(2));
    assert.equal(fastMathGame.publicState(state).problem.answer, undefined);
  });
});
