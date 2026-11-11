import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { LayoutGrid, RotateCcw, SlidersHorizontal, Trophy } from 'lucide-react';
import { sessionsApi } from '../api/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { GameIcon } from '../components/Icons.jsx';
import { DifficultyBadge } from '../components/Controls.jsx';
import { EmptyState, ErrorState, InlineError, Skeleton } from '../components/States.jsx';
import { formatClock, formatPercent } from '../utils/format.js';
import '../styles/game.css';

function headlineKey(session) {
  if (session.gameType === 'sudoku') return 'result.solved';
  const s = session.result.score;
  if (s === 0) return 'result.complete';
  if (session.result.personalBest) return 'result.personalBest';
  return s >= 10 ? 'result.great' : 'result.complete';
}

export default function ResultPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t, fmt, errorText } = useI18n();
  const { status, data: session, error, reload } = useAsync(() => sessionsApi.get(sessionId), [sessionId]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  if (status === 'loading' && !session) {
    return (
      <div className="container page">
        <div className="result">
          <div className="card result-card">
            <Skeleton width={56} height={56} radius={16} style={{ margin: '0 auto' }} />
            <Skeleton width="40%" height={22} style={{ margin: '20px auto 0' }} />
            <Skeleton width="30%" height={64} style={{ margin: '20px auto 0' }} />
            <Skeleton width="100%" height={48} style={{ marginTop: 32 }} />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    const missing = error?.status === 404;
    return (
      <div className="container page">
        <div className="card result">
          <ErrorState
            title={missing ? t('result.notFound') : t('result.loadError')}
            error={error}
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

  if (session.status === 'active') return <Navigate to={`/games/${session.gameType}/play/${session.id}`} replace />;

  const name = t(`games.${session.gameType}.name`);

  if (session.status === 'abandoned' || !session.result) {
    return (
      <div className="container page">
        <div className="card result">
          <EmptyState
            title={t('result.noResultTitle')}
            action={
              <Link to={`/games/${session.gameType}`} className="btn btn-primary">
                {t('result.playCta', { name })}
              </Link>
            }
          >
            {t('result.noResultBody')}
          </EmptyState>
        </div>
      </div>
    );
  }

  const { result } = session;
  const isTime = session.metric === 'time';
  const accuracy = result.attempts ? result.score / result.attempts : null;
  const previousBest =
    result.previousBest == null ? null : isTime ? formatClock(result.previousBest) : String(result.previousBest);

  async function playAgain() {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const next = await sessionsApi.start(session.gameType, session.difficulty);
      navigate(`/games/${next.gameType}/play/${next.id}`);
    } catch (err) {
      setStartError(err);
      setStarting(false);
    }
  }

  return (
    <div className={`container page tint-${session.gameType}`}>
      <div className="result">
        <article className="card result-card fade-in">
          <GameIcon game={session.gameType} size="lg" />
          <div className="result-kicker">
            {name} <DifficultyBadge difficulty={session.difficulty} />
          </div>
          <h1 className="result-headline">{t(headlineKey(session))}</h1>

          <div className="result-metric tabular">{isTime ? formatClock(result.timeUsedMs) : result.score}</div>
          <div className="result-metric-label">
            {isTime ? t('result.timeToSolve') : t('common.points', { count: result.score })}
          </div>

          <div className="result-badges">
            {result.personalBest && (
              <span className="chip chip-warning">
                <Trophy /> {t('result.pbBadge')}
              </span>
            )}
            {result.standing && <span className="chip">{t('result.rank', { rank: result.standing.rank })}</span>}
            {!result.personalBest && previousBest && (
              <span className="chip">{t('result.previousBest', { value: previousBest })}</span>
            )}
          </div>

          <div className="result-stats">
            <div>
              <div className="label">{isTime ? t('result.score') : t('result.timeUsed')}</div>
              <div className="value tabular">{isTime ? result.score : formatClock(result.timeUsedMs)}</div>
            </div>
            <div>
              <div className="label">{t('result.attempts')}</div>
              <div className="value tabular">{result.attempts}</div>
            </div>
            <div>
              <div className="label">{t('result.mistakes')}</div>
              <div className="value tabular">{result.mistakes}</div>
            </div>
            <div>
              <div className="label">{t('result.accuracy')}</div>
              <div className="value tabular">{formatPercent(accuracy)}</div>
            </div>
          </div>

          {session.gameType === 'make24' && result.details?.lastPuzzle?.solution && (
            <div className="result-extra">
              {t('result.lastPuzzle')} <strong className="mono">{result.details.lastPuzzle.numbers.join('  ')}</strong>
              <br />
              {t('result.oneWay')} <span className="mono">{result.details.lastPuzzle.solution}</span>
            </div>
          )}

          {startError && (
            <div style={{ marginTop: 20 }}>
              <InlineError>{errorText(startError)}</InlineError>
            </div>
          )}

          <div className="result-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={playAgain} disabled={starting}>
              {starting ? <span className="spinner" /> : <RotateCcw />} {t('result.playAgain')}
            </button>
            <Link to={`/games/${session.gameType}?difficulty=${session.difficulty}`} className="btn btn-secondary btn-lg">
              <SlidersHorizontal /> {t('result.changeDifficulty')}
            </Link>
          </div>
          <div className="result-links">
            <Link to={`/leaderboard?game=${session.gameType}&difficulty=${session.difficulty}`} className="btn btn-ghost btn-sm">
              <Trophy /> {t('result.leaderboard')}
            </Link>
            <Link to="/" className="btn btn-ghost btn-sm">
              <LayoutGrid /> {t('result.dashboard')}
            </Link>
          </div>
        </article>
        <p className="setup-note">{t('result.playedAt', { date: fmt.dateTime(result.playedAt) })}</p>
      </div>
    </div>
  );
}
