import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { cx } from '../../utils/format.js';
import '../../styles/fastmath.css';

/** Renders "? + 37 = 112" with the unknown as a styled blank. */
function ProblemText({ text }) {
  const parts = text.split('?');
  if (parts.length === 1) return text;
  return (
    <>
      {parts[0]}
      <span className="fm-blank">?</span>
      {parts[1]}
    </>
  );
}

export default function FastMathGame({ session, answer, locked, onEnd }) {
  const { t, errorText } = useI18n();
  const { problem, round } = session.state;
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState(null); // { kind: 'correct' | 'wrong', error?, key }
  const busy = useRef(false);
  const inputRef = useRef(null);
  const fieldRef = useRef(null);

  // Next problem → clear and refocus.
  useEffect(() => {
    setValue('');
    inputRef.current?.focus();
  }, [round]);

  useEffect(() => {
    if (locked) inputRef.current?.blur();
  }, [locked]);

  const shake = () => {
    const el = fieldRef.current;
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth; // restart the animation
    el.classList.add('shake');
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (busy.current || locked || value === '') return;
    busy.current = true;
    try {
      const res = await answer({ round, answer: Number(value) });
      if (res.correct) {
        setFeedback({ kind: 'correct', key: Date.now() });
      } else {
        setFeedback({ kind: 'wrong', key: Date.now() });
        shake();
        requestAnimationFrame(() => inputRef.current?.select());
      }
    } catch (err) {
      if (!['STALE_ROUND', 'TIME_UP', 'GAME_OVER'].includes(err.code)) {
        setFeedback({ kind: 'wrong', error: err, key: Date.now() });
      }
    } finally {
      busy.current = false;
      if (!locked) inputRef.current?.focus();
    }
  }

  let message = t('fastmath.prompt');
  if (feedback?.kind === 'wrong') message = feedback.error ? errorText(feedback.error) : t('fastmath.wrong');

  return (
    <div className="fm">
      <div className="fm-round tabular">{t('fastmath.problem', { n: round })}</div>

      <div className="fm-problem tabular" key={round} aria-live="polite">
        <ProblemText text={problem.text} />
      </div>

      <form className="fm-form" onSubmit={onSubmit} ref={fieldRef}>
        <input
          ref={inputRef}
          className={cx('input fm-input tabular', feedback?.kind === 'wrong' && 'is-wrong')}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="go"
          aria-label={t('fastmath.answer')}
          placeholder={t('fastmath.placeholder')}
          autoFocus
          disabled={locked}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, '').slice(0, 6));
            if (feedback?.kind === 'wrong') setFeedback(null);
          }}
        />
        <button type="submit" className="btn btn-primary fm-submit" disabled={locked || value === ''} aria-label={t('fastmath.submit')}>
          <CornerDownLeft />
        </button>
      </form>

      <p className={cx('fm-feedback', feedback?.kind)} key={feedback?.key} role="status">
        {feedback?.kind === 'correct' ? <span className="plus-one">+1</span> : message}
      </p>

      <button type="button" className="btn btn-ghost btn-sm" onClick={onEnd} disabled={locked}>
        {t('play.endRound')}
      </button>
    </div>
  );
}
