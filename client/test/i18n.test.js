import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { messages } from '../src/i18n/messages.js';
import { translate, createFormatters, errorMessage, make24FeedbackMessage } from '../src/i18n/translate.js';

/** Flattens a dictionary into "a.b.c" → kind ('string' | 'function' | 'array') */
function shape(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) out[path] = `array:${value.length}`;
    else if (value && typeof value === 'object') shape(value, path, out);
    else out[path] = typeof value === 'function' ? 'text' : typeof value === 'string' ? 'text' : typeof value;
  }
  return out;
}

describe('dictionaries', () => {
  test('Thai and English have exactly the same keys', () => {
    const th = shape(messages.th);
    const en = shape(messages.en);
    const missingInTh = Object.keys(en).filter((k) => !(k in th));
    const missingInEn = Object.keys(th).filter((k) => !(k in en));
    assert.deepEqual(missingInTh, [], 'keys missing in Thai');
    assert.deepEqual(missingInEn, [], 'keys missing in English');
    for (const key of Object.keys(en)) assert.equal(th[key], en[key], `${key} has a different shape`);
  });

  test('every Thai text value actually renders (no leftover placeholders)', () => {
    const params = { count: 3, name: 'Sudoku', level: 'ง่าย', value: 7, score: 4, rank: 2, shown: 10, total: 23, n: 5,
      date: 'x', when: 'y', filled: 1, blanks: 38, greeting: 'สวัสดี', digit: 4, number: 12, char: '?', h: 1, m: 2, s: '03',
      row: 1, col: 2, used: true, wrong: false };
    for (const key of Object.keys(shape(messages.th))) {
      const value = translate('th', key, params);
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      assert.ok(!/\{\w+\}/.test(text), `${key} → ${text}`);
      assert.ok(text.length > 0, key);
    }
  });
});

describe('translate', () => {
  test('interpolates and pluralises', () => {
    assert.equal(translate('en', 'stats.games', { count: 1 }), '1 game');
    assert.equal(translate('en', 'stats.games', { count: 3 }), '3 games');
    assert.equal(translate('th', 'stats.games', { count: 3 }), '3 เกม');
    assert.equal(translate('th', 'setup.start', { level: 'ยาก' }), 'เริ่มเกม · ยาก');
    assert.equal(translate('th', 'missing.key'), 'missing.key');
  });

  test('formatters follow the language', () => {
    const th = createFormatters('th');
    const en = createFormatters('en');
    assert.equal(en.duration(522_000), '8m 42s');
    assert.equal(th.duration(522_000), '8 นาที 42 วินาที');
    assert.equal(th.relative(Date.now()), 'เมื่อสักครู่');
    assert.match(th.date(Date.UTC(2026, 10, 11)), /2569/, 'Thai dates use the Buddhist year');
    assert.equal(th.greeting(new Date(2026, 0, 1, 9)), 'อรุณสวัสดิ์');
    assert.equal(en.greeting(new Date(2026, 0, 1, 20)), 'Good evening');
  });

  test('server errors are translated by code', () => {
    const err = (code, data = {}) => ({ code, data, message: 'english' });
    assert.equal(errorMessage('th', err('INVALID_CREDENTIALS')), 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    assert.equal(errorMessage('th', err('VALIDATION_ERROR', { field: 'password', rule: 'min' })), 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    assert.equal(errorMessage('th', err('RATE_LIMITED', { scope: 'login' })), messages.th.errors.RATE_LIMITED.login);
    assert.equal(errorMessage('th', err('RATE_LIMITED', { scope: 'weird' })), messages.th.errors.RATE_LIMITED.default);
    assert.equal(errorMessage('th', err('SOMETHING_NEW')), messages.th.errors.generic);
    assert.equal(errorMessage('th', new Error('crash')), messages.th.errors.generic);
  });

  test('Make 24 feedback is explained in the player’s language', () => {
    assert.equal(make24FeedbackMessage('th', { reason: 'value', value: '20' }), 'ได้ 20 ไม่ใช่ 24 ลองอีกครั้ง');
    assert.equal(make24FeedbackMessage('th', { reason: 'numbers', detail: 'stray', number: 12 }), '12 ไม่ใช่ตัวเลขของคุณ');
    assert.equal(make24FeedbackMessage('en', { reason: 'syntax', detail: 'unknown_thing' }), messages.en.make24.wrong.syntax.generic);
    assert.equal(make24FeedbackMessage('th', { reason: 'math', detail: 'div_zero' }), 'หารด้วยศูนย์ไม่ได้');
  });
});
