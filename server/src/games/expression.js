/**
 * Safe arithmetic expression parser for Make 24 answers.
 * Grammar (no unary minus, no exponent, no implicit multiplication):
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := NUMBER | '(' expr ')'
 * Never uses eval.
 */
import { rational, add, sub, mul, div } from './rational.js';

export class ExpressionError extends Error {
  /**
   * @param {string} message English message (for API consumers / logs)
   * @param {string} key     machine-readable reason, translated by the client
   * @param {object} [params]
   */
  constructor(message, key = 'invalid', params = undefined) {
    super(message);
    this.name = 'ExpressionError';
    this.key = key;
    this.params = params;
  }
}

const MAX_LENGTH = 120;
const MAX_DEPTH = 12;

const OPERATORS = {
  '+': '+',
  '-': '-',
  '−': '-', // − minus sign
  '–': '-', // – en dash
  '*': '*',
  '×': '*', // ×
  x: '*',
  X: '*',
  '·': '*', // ·
  '/': '/',
  '÷': '/', // ÷
};

export function tokenize(input) {
  if (typeof input !== 'string') throw new ExpressionError('Enter an expression', 'empty');
  if (input.length > MAX_LENGTH) throw new ExpressionError('That expression is too long', 'too_long');
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t') {
      i++;
    } else if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
      if (j - i > 3) throw new ExpressionError('Numbers can have at most 3 digits', 'too_many_digits');
      tokens.push({ type: 'num', value: Number(input.slice(i, j)) });
      i = j;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ type: ch });
      i++;
    } else if (OPERATORS[ch]) {
      tokens.push({ type: 'op', value: OPERATORS[ch] });
      i++;
    } else {
      throw new ExpressionError(`"${ch}" isn't allowed — use numbers, + − × ÷ and parentheses`, 'bad_char', { char: ch });
    }
  }
  if (tokens.length === 0) throw new ExpressionError('Enter an expression', 'empty');
  return tokens;
}

export function parse(input) {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (t, ...ops) => t?.type === 'op' && ops.includes(t.value);

  function parseExpr(depth) {
    let left = parseTerm(depth);
    while (isOp(peek(), '+', '-')) {
      const op = tokens[pos++].value;
      left = { type: 'bin', op, left, right: parseTerm(depth) };
    }
    return left;
  }

  function parseTerm(depth) {
    let left = parseFactor(depth);
    while (isOp(peek(), '*', '/')) {
      const op = tokens[pos++].value;
      left = { type: 'bin', op, left, right: parseFactor(depth) };
    }
    return left;
  }

  function parseFactor(depth) {
    const t = peek();
    if (!t) throw new ExpressionError('The expression ends too early', 'ends_early');
    if (t.type === 'num') {
      pos++;
      return { type: 'num', value: t.value };
    }
    if (t.type === '(') {
      if (depth >= MAX_DEPTH) throw new ExpressionError('Too many nested parentheses', 'too_deep');
      pos++;
      const inner = parseExpr(depth + 1);
      if (peek()?.type !== ')') throw new ExpressionError('A closing parenthesis is missing', 'missing_close');
      pos++;
      return inner;
    }
    if (isOp(t, '-')) throw new ExpressionError('Negative numbers aren’t allowed', 'negative');
    if (t.type === ')') throw new ExpressionError('There’s an unexpected closing parenthesis', 'unexpected_close');
    throw new ExpressionError('Two operators can’t be next to each other', 'adjacent_ops');
  }

  const ast = parseExpr(0);
  if (pos < tokens.length) {
    const t = tokens[pos];
    if (t.type === ')') throw new ExpressionError('There’s an unmatched closing parenthesis', 'unmatched_close');
    if (t.type === '(' || t.type === 'num') throw new ExpressionError('Put an operator between numbers and parentheses', 'missing_operator');
    throw new ExpressionError('The expression isn’t complete', 'incomplete');
  }
  return ast;
}

export function collectNumbers(ast, out = []) {
  if (ast.type === 'num') out.push(ast.value);
  else {
    collectNumbers(ast.left, out);
    collectNumbers(ast.right, out);
  }
  return out;
}

export function evaluate(ast) {
  if (ast.type === 'num') return rational(ast.value);
  const a = evaluate(ast.left);
  const b = evaluate(ast.right);
  try {
    switch (ast.op) {
      case '+':
        return add(a, b);
      case '-':
        return sub(a, b);
      case '*':
        return mul(a, b);
      default:
        return div(a, b);
    }
  } catch (err) {
    if (err instanceof RangeError) throw err.message === 'Division by zero' ? new ExpressionError('You can’t divide by zero', 'div_zero') : new ExpressionError(err.message, 'out_of_range');
    throw err;
  }
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };
const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/** Formats an AST with the minimum parentheses and pretty operator symbols. */
export function format(ast, parentPrec = 0, isRight = false, parentOp = null) {
  if (ast.type === 'num') return String(ast.value);
  const prec = PRECEDENCE[ast.op];
  const text = `${format(ast.left, prec, false, ast.op)} ${SYMBOL[ast.op]} ${format(ast.right, prec, true, ast.op)}`;
  const needsParens =
    prec < parentPrec || (prec === parentPrec && isRight && (parentOp === '-' || parentOp === '/'));
  return needsParens ? `(${text})` : text;
}
