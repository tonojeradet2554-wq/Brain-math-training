import { ChevronLeft } from 'lucide-react';
import { GameIcon } from '../../components/Icons.jsx';
import { DifficultyBadge } from '../../components/Controls.jsx';
import { useNow } from '../../hooks/useClock.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { cx, formatClock, formatCountdown } from '../../utils/format.js';

export function GameTopBar({ session, onLeave, leaveLabel, children }) {
  const { t } = useI18n();
  return (
    <header className="game-topbar">
      <div className="game-topbar-left">
        <button type="button" className="btn btn-ghost btn-sm game-leave" onClick={onLeave}>
          <ChevronLeft /> {leaveLabel}
        </button>
        <div className="game-title">
          <GameIcon game={session.gameType} size="sm" />
          <div>
            <strong>{t(`games.${session.gameType}.name`)}</strong>
            <DifficultyBadge difficulty={session.difficulty} />
          </div>
        </div>
      </div>
      <div className="game-topbar-right">{children}</div>
    </header>
  );
}

export function Pill({ label, value, tone, bump }) {
  return (
    <div className={cx('pill', tone && `pill-${tone}`)}>
      <span className="pill-label">{label}</span>
      <span className="pill-value tabular" key={bump}>
        {value}
      </span>
    </div>
  );
}

/** Countdown pill + thin progress bar. Re-renders on its own, not the whole game. */
export function Countdown({ label, deadline, durationMs, now, active }) {
  const t = useNow(now, active, 100);
  const remaining = Math.max(0, deadline - t);
  const warn = remaining <= 10_000;
  return (
    <>
      <Pill label={label} value={formatCountdown(remaining)} tone={warn ? 'danger' : undefined} />
      <div className="timer-bar" aria-hidden="true">
        <div className={cx(warn && 'warn')} style={{ transform: `scaleX(${remaining / durationMs})` }} />
      </div>
    </>
  );
}

export function Stopwatch({ label, startedAt, endedAt, now, active }) {
  const t = useNow(now, active, 500);
  return <Pill label={label} value={formatClock((endedAt ?? t) - startedAt)} />;
}

export function useElapsed(startedAt, now, active) {
  const t = useNow(now, active, 500);
  return t - startedAt;
}
