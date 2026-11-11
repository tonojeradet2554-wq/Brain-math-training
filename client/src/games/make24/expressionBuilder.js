/**
 * Pure helpers for building a Make 24 expression from taps / keys.
 * Tokens: { type: 'num', value, card } | { type: 'op', value: '+' | '-' | '*' | '/' } | { type: '(' } | { type: ')' }
 * The server re-parses and verifies the final string; these rules just keep the UI from
 * producing malformed input.
 */

export const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
export const OPERATORS = ['+', '-', '*', '/'];

const last = (tokens) => tokens[tokens.length - 1];

export function openDepth(tokens) {
  let depth = 0;
  for (const t of tokens) {
    if (t.type === '(') depth++;
    else if (t.type === ')') depth--;
  }
  return depth;
}

/** True when the next token must be a number or "(". */
export function expectsOperand(tokens) {
  const t = last(tokens);
  return !t || t.type === 'op' || t.type === '(';
}

export function allowed(tokens) {
  const operand = expectsOperand(tokens);
  return {
    number: operand,
    open: operand,
    operator: !operand,
    close: !operand && openDepth(tokens) > 0,
  };
}

export const usedCards = (tokens) => new Set(tokens.filter((t) => t.type === 'num').map((t) => t.card));

export function isComplete(tokens, cardCount) {
  return tokens.length > 0 && !expectsOperand(tokens) && openDepth(tokens) === 0 && usedCards(tokens).size === cardCount;
}

/** What's still missing, as a translation key + params (null when ready). */
export function missingHint(tokens, cardCount) {
  const left = cardCount - usedCards(tokens).size;
  if (tokens.length === 0) return { key: 'make24.hint.start' };
  if (left > 0) return { key: 'make24.hint.useMore', params: { count: left } };
  if (expectsOperand(tokens)) return { key: 'make24.hint.finish' };
  const depth = openDepth(tokens);
  if (depth > 0) return { key: 'make24.hint.close', params: { count: depth } };
  return null;
}

export function toExpression(tokens) {
  return tokens.map((t) => (t.type === 'num' ? String(t.value) : t.type === 'op' ? t.value : t.type)).join(' ');
}

export function tokenLabel(t) {
  if (t.type === 'num') return String(t.value);
  if (t.type === 'op') return SYMBOLS[t.value];
  return t.type;
}

/** Maps a keyboard key to an operator / paren token, or null. */
export function keyToToken(key) {
  if (key === '+') return { type: 'op', value: '+' };
  if (key === '-' || key === '−') return { type: 'op', value: '-' };
  if (key === '*' || key === 'x' || key === 'X' || key === '×') return { type: 'op', value: '*' };
  if (key === '/' || key === '÷') return { type: 'op', value: '/' };
  if (key === '(' || key === ')') return { type: key };
  return null;
}

/** Whether a token may be appended right now. */
export function canAppend(tokens, token) {
  const a = allowed(tokens);
  if (token.type === 'num') return a.number;
  if (token.type === 'op') return a.operator;
  if (token.type === '(') return a.open;
  return a.close;
}
