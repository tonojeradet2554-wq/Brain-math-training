import { useEffect, useRef, useState } from 'react';
import { Check, Delete } from 'lucide-react';
import { isDialogOpen } from '../../components/ConfirmDialog.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { cx } from '../../utils/format.js';
import {
  OPERATORS,
  SYMBOLS,
  allowed,
  canAppend,
  isComplete,
  keyToToken,
  missingHint,
  tokenLabel,
  toExpression,
  usedCards,
} from './expressionBuilder.js';
import '../../styles/make24.css';

export default function Make24Game({ session, answer, locked, onEnd }) {
  const { t, errorText, make24Feedback } = useI18n();
  const { numbers, round } = session.state;
  const [tokens, setTokens] = useState([]);
  // { kind: 'correct', expression } | { kind: 'wrong', feedback } | { kind: 'wrong', error }, plus an animation key.
  // Stored as data (not text) so it re-translates if the language changes.
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const displayRef = useRef(null);
  const digitBuffer = useRef({ value: '', timer: null });

  // New puzzle → clear the expression.
  useEffect(() => {
    setTokens([]);
  }, [round]);

  const used = usedCards(tokens);
  const can = allowed(tokens);
  const complete = isComplete(tokens, numbers.length);
  const hint = missingHint(tokens, numbers.length);
  const disabled = locked || busy;

  function append(token) {
    if (disabled) return;
    setTokens((current) => (canAppend(current, token) ? [...current, token] : current));
    setResult(null);
  }

  const pickCard = (index) => {
    if (used.has(index)) return;
    append({ type: 'num', value: numbers[index], card: index });
  };

  const undo = () => !disabled && setTokens((current) => current.slice(0, -1));
  const clear = () => !disabled && setTokens([]);

  function shake() {
    const el = displayRef.current;
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth; // restart the animation
    el.classList.add('shake');
  }

  async function submit() {
    if (!complete || busyRef.current || locked) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await answer({ round, expression: toExpression(tokens) });
      if (res.correct) {
        setResult({ kind: 'correct', expression: res.feedback.expression, key: Date.now() });
      } else {
        setResult({ kind: 'wrong', feedback: res.feedback, key: Date.now() });
        shake();
      }
    } catch (err) {
      if (!['STALE_ROUND', 'TIME_UP', 'GAME_OVER'].includes(err.code)) {
        setResult({ kind: 'wrong', error: err, key: Date.now() });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Keyboard: digits pick a matching card (two-digit cards via quick double press),
  // + - * / ( ) build, Enter submits, Backspace undoes, Escape clears.
  const keyHandler = useRef(null);
  keyHandler.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isDialogOpen()) return;
    const buf = digitBuffer.current;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const candidate = buf.value + e.key;
      clearTimeout(buf.timer);
      const free = numbers.map((n, i) => ({ n, i })).filter(({ i }) => !used.has(i));
      const exact = free.find(({ n }) => String(n) === candidate);
      const longer = free.some(({ n }) => String(n).startsWith(candidate) && String(n) !== candidate);
      if (exact && !longer) {
        buf.value = '';
        pickCard(exact.i);
      } else if (longer) {
        buf.value = candidate;
        buf.timer = setTimeout(() => {
          const match = free.find(({ n }) => String(n) === buf.value);
          buf.value = '';
          if (match) pickCard(match.i);
        }, 600);
      } else {
        buf.value = '';
      }
      return;
    }
    const token = keyToToken(e.key);
    if (token) {
      e.preventDefault();
      append(token);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Escape') {
      clear();
    }
  };
  useEffect(() => {
    const onKey = (e) => keyHandler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let statusText;
  if (result?.kind === 'correct') statusText = `${result.expression} = 24`;
  else if (result?.error) statusText = errorText(result.error);
  else if (result?.kind === 'wrong') statusText = make24Feedback(result.feedback);
  else statusText = hint ? t(hint.key, hint.params) : t('make24.hint.ready');

  return (
    <div className="m24">
      <p className="m24-goal">
        {t('make24.goalBefore')} <strong>24</strong> {t('make24.goalAfter')}
      </p>

      <div className="m24-cards" key={round}>
        {numbers.map((n, i) => (
          <button
            key={i}
            type="button"
            className={cx('num-card', used.has(i) && 'used')}
            style={{ '--i': i }}
            disabled={disabled || used.has(i) || !can.number}
            onClick={() => pickCard(i)}
            aria-label={t('make24.card', { value: n, used: used.has(i) })}
          >
            {n}
          </button>
        ))}
      </div>

      <div
        ref={displayRef}
        className={cx('expr-display', result?.kind === 'wrong' && 'is-wrong', complete && 'is-ready')}
        aria-live="polite"
        aria-label={t('make24.expression')}
      >
        {tokens.length ? (
          tokens.map((tok, i) => (
            <span key={i} className={cx('expr-token', tok.type === 'num' ? 'num' : 'sym')}>
              {tokenLabel(tok)}
            </span>
          ))
        ) : (
          <span className="expr-placeholder">{t('make24.placeholder')}</span>
        )}
      </div>

      <p className={cx('m24-feedback', result?.kind)} role="status" key={result?.key}>
        {result?.kind === 'correct' && <Check size={16} />}
        {statusText}
        {result?.kind === 'correct' && <span className="plus-one">+1</span>}
      </p>

      <div className="op-pad">
        {OPERATORS.map((op) => (
          <button key={op} type="button" className="key" disabled={disabled || !can.operator} onClick={() => append({ type: 'op', value: op })}>
            {SYMBOLS[op]}
          </button>
        ))}
        <button type="button" className="key" disabled={disabled || !can.open} onClick={() => append({ type: '(' })}>
          (
        </button>
        <button type="button" className="key" disabled={disabled || !can.close} onClick={() => append({ type: ')' })}>
          )
        </button>
        <button type="button" className="key key-muted" disabled={disabled || !tokens.length} onClick={undo} aria-label={t('make24.undo')}>
          <Delete size={20} />
        </button>
        <button type="button" className="key key-muted key-text" disabled={disabled || !tokens.length} onClick={clear}>
          {t('make24.clear')}
        </button>
      </div>

      <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!complete || disabled} onClick={submit}>
        {busy && <span className="spinner" />}
        {t('make24.check')}
      </button>

      <button type="button" className="btn btn-ghost btn-sm m24-end" onClick={onEnd} disabled={locked}>
        {t('play.endRound')}
      </button>
    </div>
  );
}
