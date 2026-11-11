import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { Flag } from 'lucide-react';
import { useGameSession } from '../games/common/useGameSession.js';
import { Countdown, GameTopBar, Pill, Stopwatch } from '../games/common/GameChrome.jsx';
import { useDeadline } from '../hooks/useClock.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/States.jsx';
import SudokuGame from '../games/sudoku/SudokuGame.jsx';
import Make24Game from '../games/make24/Make24Game.jsx';
import FastMathGame from '../games/fastmath/FastMathGame.jsx';
import '../styles/game.css';

function CenteredSpinner() {
  return (
    <div className="game-page">
      <div className="full-page">
        <Spinner large />
      </div>
    </div>
  );
}

export default function GamePlayPage() {
  const { gameId, sessionId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { session, loadState, reload, clock, answer, finish, abandon } = useGameSession(sessionId);

  const [timeUp, setTimeUp] = useState(false);
  const [finishError, setFinishError] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const allowLeave = useRef(false);

  const active = session?.status === 'active';
  const timed = Boolean(session?.timed);

  // Timed rounds: confirm before navigating away inside the app...
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      timed && active && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );
  // ...and before closing / reloading the tab.
  useEffect(() => {
    if (!timed || !active) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [timed, active]);

  // A finished game goes straight to its result page.
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  useEffect(() => {
    if (session?.status !== 'completed') return;
    allowLeave.current = true;
    if (blockerRef.current.state === 'blocked') blockerRef.current.reset();
    navigate(`/results/${session.id}`, { replace: true });
  }, [session?.status, session?.id, navigate]);

  // Keep the URL honest if someone edits the game segment.
  useEffect(() => {
    if (session && session.gameType !== gameId) {
      navigate(`/games/${session.gameType}/play/${session.id}`, { replace: true });
    }
  }, [session, gameId, navigate]);

  const endRound = useCallback(() => {
    setFinishError(null);
    finish().catch((err) => setFinishError(err));
  }, [finish]);

  const onDeadline = useCallback(() => {
    setTimeUp(true);
    endRound();
  }, [endRound]);
  useDeadline(session?.deadlineAt, clock.now, timed && active, onDeadline);

  async function leaveRound() {
    setLeaving(true);
    allowLeave.current = true;
    try {
      await abandon();
    } catch {
      /* leaving anyway; the server abandons stale rounds on the next start */
    }
    if (blocker.state === 'blocked') blocker.proceed();
    else navigate(`/games/${gameId}`);
  }

  async function giveUp() {
    setLeaving(true);
    try {
      await abandon();
      navigate(`/games/${gameId}`, { replace: true });
    } catch (err) {
      setLeaving(false);
      setConfirmGiveUp(false);
      setFinishError(err);
    }
  }

  /* ---------- render ---------- */

  if (!session) {
    if (loadState.status !== 'error') return <CenteredSpinner />;
    const missing = loadState.error?.status === 404;
    return (
      <div className="game-page">
        <div className="full-page">
          <ErrorState
            title={missing ? t('play.notFound') : t('play.loadError')}
            error={loadState.error}
            onRetry={missing ? undefined : reload}
            action={
              <Link to="/" className="btn btn-ghost btn-sm">
                {t('common.backToDashboard')}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (session.status === 'completed' || (session.status === 'abandoned' && leaving)) return <CenteredSpinner />;

  const name = t(`games.${session.gameType}.name`);

  if (session.status === 'abandoned') {
    return (
      <div className="game-page">
        <div className="full-page">
          <EmptyState
            icon={Flag}
            title={t('play.endedTitle')}
            action={
              <Link to={`/games/${session.gameType}`} className="btn btn-primary">
                {t('play.endedCta', { name })}
              </Link>
            }
          >
            {t('play.endedBody')}
          </EmptyState>
        </div>
      </div>
    );
  }

  const inputLocked = timeUp || leaving;

  return (
    <div className={`game-page tint-${session.gameType}`}>
      <GameTopBar
        session={session}
        leaveLabel={timed ? t('play.leave') : t('play.saveExit')}
        onLeave={() => navigate(`/games/${session.gameType}`)}
      >
        {timed ? (
          <>
            <Pill label={t('play.score')} value={session.score} bump={session.score} />
            <Countdown
              label={t('play.time')}
              deadline={session.deadlineAt}
              durationMs={session.durationMs}
              now={clock.now}
              active={active && !timeUp}
            />
            <button type="button" className="btn btn-secondary btn-sm hide-sm" onClick={() => setConfirmEnd(true)}>
              {t('play.endRound')}
            </button>
          </>
        ) : (
          <>
            <Pill label={t('play.mistakes')} value={session.mistakes} tone={session.mistakes ? 'danger' : undefined} />
            <Stopwatch label={t('play.time')} startedAt={session.startedAt} now={clock.now} active={active} />
          </>
        )}
      </GameTopBar>

      <main className="game-main">
        {session.gameType === 'sudoku' && (
          <SudokuGame session={session} answer={answer} now={clock.now} onGiveUp={() => setConfirmGiveUp(true)} />
        )}
        {session.gameType === 'make24' && (
          <Make24Game session={session} answer={answer} locked={inputLocked} onEnd={() => setConfirmEnd(true)} />
        )}
        {session.gameType === 'fastmath' && (
          <FastMathGame session={session} answer={answer} locked={inputLocked} onEnd={() => setConfirmEnd(true)} />
        )}
      </main>

      {(timeUp || finishError) && (
        <div className="time-up" role="status">
          <div className="card time-up-card">
            {finishError ? (
              <ErrorState title={t('play.saveError')} error={finishError} onRetry={endRound} />
            ) : (
              <>
                <h2>{t('play.timeUp')}</h2>
                <p className="tabular">{t('play.points', { count: session.score })}</p>
                <div className="muted time-up-saving">
                  <Spinner /> {t('play.saving')}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('play.leaveTitle')}
        confirmLabel={t('play.leaveConfirm')}
        cancelLabel={t('play.keepPlaying')}
        tone="danger"
        busy={leaving}
        onConfirm={leaveRound}
        onCancel={() => blocker.reset?.()}
      >
        {t('play.leaveBody')}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmEnd}
        title={t('play.endTitle')}
        confirmLabel={t('play.endConfirm')}
        cancelLabel={t('play.keepPlaying')}
        onConfirm={() => {
          setConfirmEnd(false);
          endRound();
        }}
        onCancel={() => setConfirmEnd(false)}
      >
        {t('play.endBody', { score: session.score })}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmGiveUp}
        title={t('play.giveUpTitle')}
        confirmLabel={t('play.giveUpConfirm')}
        cancelLabel={t('play.keepSolving')}
        tone="danger"
        busy={leaving}
        onConfirm={giveUp}
        onCancel={() => setConfirmGiveUp(false)}
      >
        {t('play.giveUpBody')}
      </ConfirmDialog>
    </div>
  );
}
