import { Link } from 'react-router';
import { ArrowRight, Clock, Gamepad2, Sigma, Timer, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { statsApi } from '../api/endpoints.js';
import { GAMES, GAME_ORDER } from '../games/catalog.js';
import { GameIcon } from '../components/Icons.jsx';
import { DifficultyBadge, StatTile } from '../components/Controls.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { formatClock, formatNumber } from '../utils/format.js';
import '../styles/dashboard.css';

/** Best result across difficulties for the game card footer. */
function bestFor(gameId, stats) {
  const game = stats?.games?.[gameId];
  if (!game || game.gamesPlayed === 0) return null;
  const entries = Object.entries(game.difficulties).filter(([, d]) => d);
  if (game.metric === 'time') {
    const best = entries.filter(([, d]) => d.bestTimeMs != null).sort((a, b) => a[1].bestTimeMs - b[1].bestTimeMs)[0];
    return best ? { time: best[1].bestTimeMs, level: best[0] } : null;
  }
  const best = entries.sort((a, b) => b[1].bestScore - a[1].bestScore)[0];
  return best ? { score: best[1].bestScore, level: best[0] } : null;
}

export function ResultRow({ item }) {
  const { t, fmt } = useI18n();
  const isTime = GAMES[item.gameType].metric === 'time';
  return (
    <Link to={`/results/${item.sessionId}`} className="result-row">
      <GameIcon game={item.gameType} size="sm" />
      <div className="result-row-main">
        <div className="result-row-title">
          {t(`games.${item.gameType}.name`)}
          <DifficultyBadge difficulty={item.difficulty} />
          {item.personalBest && <span className="chip chip-warning">{t('common.best')}</span>}
        </div>
        <div className="result-row-sub">{fmt.relative(item.playedAt)}</div>
      </div>
      <div className="result-row-score tabular">
        {isTime ? formatClock(item.timeUsedMs) : t('common.pts', { count: item.score })}
        <span>{isTime ? t('common.cells', { count: item.score }) : formatClock(item.timeUsedMs)}</span>
      </div>
    </Link>
  );
}

function GameCard({ id, stats, loading }) {
  const { t } = useI18n();
  const best = bestFor(id, stats);
  const played = stats?.games?.[id]?.gamesPlayed ?? 0;
  const name = t(`games.${id}.name`);
  return (
    <article className={`card game-card tint-${id}`}>
      <div className="game-card-top">
        <GameIcon game={id} />
        <span className="game-card-category">{t(`games.${id}.category`)}</span>
      </div>
      <div>
        <h3>{name}</h3>
        <p>{t(`games.${id}.description`)}</p>
      </div>
      <div className="game-card-meta">
        {t(`games.${id}.meta`).map((m) => (
          <span key={m} className="chip">
            {m}
          </span>
        ))}
      </div>
      <div className="game-card-best">
        {loading ? (
          <Skeleton width="70%" height={14} />
        ) : best ? (
          <>
            <span>{t('dashboard.yourBest')}</span>
            <span className="tabular">
              <strong>{best.time != null ? formatClock(best.time) : t('common.pts', { count: best.score })}</strong> ·{' '}
              {t(`difficulty.${best.level}`)}
            </span>
          </>
        ) : (
          <span>{played ? t('dashboard.noBest') : t('dashboard.notPlayed')}</span>
        )}
      </div>
      <Link to={`/games/${id}`} className="btn btn-primary btn-block game-card-play">
        {t('dashboard.play', { name })} <ArrowRight />
      </Link>
    </article>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const { status, data, error, reload } = useAsync(() => statsApi.summary(), []);
  const loading = status === 'loading' && !data;
  const fastBest = data ? Math.max(0, ...Object.values(data.games.fastmath.difficulties).map((d) => d?.bestScore ?? 0)) : 0;
  const sudokuBest = data?.games.sudoku.bestTimeMs;

  return (
    <div className="container page">
      <header className="page-header dashboard-hero">
        <div>
          <h1>{t('dashboard.hello', { greeting: fmt.greeting(), name: user.username })}</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
      </header>

      {status === 'error' ? (
        <div className="card">
          <ErrorState title={t('dashboard.statsError')} error={error} onRetry={reload} />
        </div>
      ) : (
        <div className="stat-grid stagger">
          <StatTile icon={Gamepad2} label={t('dashboard.gamesPlayed')} value={formatNumber(data?.totals.gamesPlayed ?? 0)} loading={loading} />
          <StatTile icon={Sigma} label={t('dashboard.totalScore')} value={formatNumber(data?.totals.totalScore ?? 0)} loading={loading} />
          <StatTile
            icon={Timer}
            label={t('dashboard.fastestSudoku')}
            value={sudokuBest != null ? formatClock(sudokuBest) : '—'}
            loading={loading}
          />
          <StatTile icon={Zap} label={t('dashboard.bestFastMath')} value={fastBest ? `${fastBest}` : '—'} loading={loading} />
        </div>
      )}

      <section className="section">
        <div className="section-header">
          <h2>{t('dashboard.games')}</h2>
        </div>
        <div className="game-grid stagger">
          {GAME_ORDER.map((id) => (
            <GameCard key={id} id={id} stats={data} loading={loading} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>{t('dashboard.recent')}</h2>
          {data?.recent.length > 0 && <Link to="/stats">{t('dashboard.viewAll')}</Link>}
        </div>
        <div className="card">
          {loading ? (
            <div className="result-list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="result-row">
                  <Skeleton width={34} height={34} radius={10} />
                  <div className="result-row-main">
                    <Skeleton width="40%" height={14} />
                    <Skeleton width="20%" height={12} style={{ marginTop: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.recent.length ? (
            <div className="result-list">
              {data.recent.map((item) => (
                <ResultRow key={item.id} item={item} />
              ))}
            </div>
          ) : status === 'success' ? (
            <EmptyState icon={Clock} title={t('dashboard.emptyTitle')}>
              {t('dashboard.emptyBody')}
            </EmptyState>
          ) : null}
        </div>
      </section>
    </div>
  );
}
