import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Pencil } from 'lucide-react';
import { isDialogOpen } from '../../components/ConfirmDialog.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { useElapsed } from '../common/GameChrome.jsx';
import { cx, formatClock } from '../../utils/format.js';
import {
  clearNotesAfterPlacement,
  colOf,
  digitCounts,
  firstEmpty,
  isPeer,
  move,
  omit,
  rowOf,
} from './sudokuHelpers.js';
import '../../styles/sudoku.css';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const Cell = memo(function Cell({ index, value, notes, kind, selected, peer, same, pending, anim, onSelect }) {
  const { t } = useI18n();
  const r = rowOf(index);
  const c = colOf(index);
  return (
    <button
      type="button"
      role="gridcell"
      data-i={index}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-label={t('sudoku.cell', { row: r + 1, col: c + 1, value, wrong: kind === 'wrong' })}
      className={cx(
        'cell',
        kind,
        selected && 'selected',
        peer && 'peer',
        same && 'same',
        pending && 'pending',
        (c === 2 || c === 5) && 'box-r',
        (r === 2 || r === 5) && 'box-b',
      )}
      onClick={() => onSelect(index)}
    >
      {value ? (
        <span key={anim ?? 'v'} className={cx('cell-value', anim && (kind === 'wrong' ? 'is-wrong' : 'is-correct'))}>
          {value}
        </span>
      ) : notes ? (
        <span className="notes" aria-hidden="true">
          {DIGITS.map((d) => (
            <span key={d}>{notes & (1 << d) ? d : ''}</span>
          ))}
        </span>
      ) : null}
    </button>
  );
});

export default function SudokuGame({ session, answer, now, onGiveUp }) {
  const { t, errorText } = useI18n();
  const { puzzle, board, blanks, filled } = session.state;
  const [selected, setSelected] = useState(() => firstEmpty(board));
  const [wrong, setWrong] = useState({}); // cell -> wrong value (client-side display only)
  const [pending, setPending] = useState({}); // cell -> value awaiting the server
  const [notes, setNotes] = useState({}); // cell -> bitmask of pencil marks
  const [notesMode, setNotesMode] = useState(false);
  const [anim, setAnim] = useState(null); // { cell, key }
  const [message, setMessage] = useState(null); // { value } for a wrong number, or { error }
  const inFlight = useRef(new Set());
  const boardRef = useRef(null);
  const elapsed = useElapsed(session.startedAt, now, true);

  const counts = useMemo(() => digitCounts(board), [board]);
  const valueAt = useCallback((i) => (board[i] !== '0' ? Number(board[i]) : (pending[i] ?? wrong[i] ?? 0)), [board, pending, wrong]);

  const place = useCallback(
    async (cell, value) => {
      if (cell == null || puzzle[cell] !== '0' || board[cell] !== '0') return;
      if (notesMode) {
        setNotes((n) => {
          const mask = (n[cell] ?? 0) ^ (1 << value);
          return mask ? { ...n, [cell]: mask } : omit(n, cell);
        });
        setWrong((w) => omit(w, cell));
        return;
      }
      if (inFlight.current.has(cell)) return; // one request per cell at a time
      inFlight.current.add(cell);
      setPending((p) => ({ ...p, [cell]: value }));
      setWrong((w) => omit(w, cell));
      setMessage(null);
      try {
        const res = await answer({ cell, value });
        if (res.correct) {
          setNotes((n) => clearNotesAfterPlacement(n, cell, value));
        } else {
          setWrong((w) => ({ ...w, [cell]: value }));
          setMessage({ value });
        }
        setAnim({ cell, key: Date.now() });
      } catch (err) {
        if (err.code !== 'ALREADY_FILLED' && err.code !== 'GAME_OVER') setMessage({ error: err });
      } finally {
        inFlight.current.delete(cell);
        setPending((p) => omit(p, cell));
      }
    },
    [answer, board, puzzle, notesMode],
  );

  const erase = useCallback(
    (cell) => {
      if (cell == null || board[cell] !== '0') return;
      setWrong((w) => omit(w, cell));
      setNotes((n) => omit(n, cell));
      setMessage(null);
    },
    [board],
  );

  // Keyboard: 1–9 place, arrows move, Backspace/Delete erase, N toggles notes.
  const keyHandler = useRef(null);
  keyHandler.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isDialogOpen()) return;
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      place(selected, Number(e.key));
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      e.preventDefault();
      erase(selected);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const next = move(selected ?? 0, e.key);
      setSelected(next);
      boardRef.current?.querySelector(`[data-i="${next}"]`)?.focus();
    } else if (e.key === 'n' || e.key === 'N') {
      setNotesMode((m) => !m);
    }
  };
  useEffect(() => {
    const onKey = (e) => keyHandler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedValue = selected != null && board[selected] !== '0' ? Number(board[selected]) : 0;
  const progress = blanks ? filled / blanks : 0;
  const messageText = message ? (message.error ? errorText(message.error) : t('sudoku.wrong', { value: message.value })) : null;

  return (
    <div className="sudoku-layout">
      <div className="sudoku-play">
        <div className="sudoku-board" role="grid" aria-label={t('sudoku.board')} ref={boardRef}>
          {Array.from({ length: 81 }, (_, i) => {
            const value = valueAt(i);
            const kind = puzzle[i] !== '0' ? 'given' : board[i] !== '0' ? 'filled' : wrong[i] != null ? 'wrong' : 'empty';
            return (
              <Cell
                key={i}
                index={i}
                value={value}
                notes={kind === 'empty' && !pending[i] ? notes[i] : 0}
                kind={kind}
                selected={selected === i}
                peer={selected != null && isPeer(selected, i)}
                same={selectedValue > 0 && selected !== i && kind !== 'wrong' && value === selectedValue}
                pending={pending[i] != null}
                anim={anim?.cell === i ? anim.key : undefined}
                onSelect={setSelected}
              />
            );
          })}
        </div>

        <p className={cx('sudoku-message', messageText && 'show')} role="status" aria-live="polite">
          {messageText ?? ' '}
        </p>

        <div className="numpad" aria-label={t('sudoku.numpad')}>
          {DIGITS.map((d) => {
            const left = 9 - counts[d];
            return (
              <button
                key={d}
                type="button"
                disabled={left <= 0}
                onClick={() => place(selected, d)}
                aria-label={t('sudoku.place', { digit: d })}
              >
                <span>{d}</span>
                <small className="tabular">{left > 0 ? left : '✓'}</small>
              </button>
            );
          })}
        </div>

        <div className="sudoku-tools">
          <button
            type="button"
            className={cx('tool', notesMode && 'on')}
            aria-pressed={notesMode}
            onClick={() => setNotesMode((m) => !m)}
          >
            <Pencil /> {t('sudoku.notes')} <span className="tool-state">{notesMode ? t('sudoku.on') : t('sudoku.off')}</span>
          </button>
          <button type="button" className="tool" onClick={() => erase(selected)}>
            <Eraser /> {t('sudoku.erase')}
          </button>
        </div>
      </div>

      <aside className="card sudoku-side">
        <div className="side-block">
          <div className="side-label">{t('sudoku.time')}</div>
          <div className="side-time tabular">{formatClock(elapsed)}</div>
        </div>
        <div className="side-block">
          <div className="side-row">
            <span className="side-label">{t('sudoku.progress')}</span>
            <span className="tabular side-small">
              {filled} / {blanks}
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="side-stats">
          <div>
            <div className="side-label">{t('sudoku.score')}</div>
            <div className="side-num tabular">{session.score}</div>
          </div>
          <div>
            <div className="side-label">{t('sudoku.mistakes')}</div>
            <div className={cx('side-num tabular', session.mistakes > 0 && 'danger')}>{session.mistakes}</div>
          </div>
        </div>
        <p className="side-hint">
          <kbd>1</kbd>–<kbd>9</kbd> {t('sudoku.keys.place')} · <kbd>←↑↓→</kbd> {t('sudoku.keys.move')} · <kbd>N</kbd>{' '}
          {t('sudoku.keys.notes')} · <kbd>⌫</kbd> {t('sudoku.keys.erase')}
        </p>
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onGiveUp}>
          {t('sudoku.giveUp')}
        </button>
      </aside>
    </div>
  );
}
