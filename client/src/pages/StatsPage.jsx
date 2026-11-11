import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Clock, Gamepad2, History, Sigma, Target } from 'lucide-react';
import { statsApi } from '../api/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { DIFFICULTIES, GAMES, GAME_ORDER } from '../games/catalog.js';
import { GameIcon } from '../components/Icons.jsx';
import { SegmentedControl, StatTile } from '../components/Controls.jsx';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../components/States.jsx';
import { formatClock, formatNumber, formatPercent } from '../utils/format.js';
import { ResultRow } from './DashboardPage.jsx';
import '../styles/dashboard.css';
import '../styles/stats.css';

function headlineFor(id, g, t) {
  if (!g || g.gamesPlayed === 0) return null;
  if (id === 'sudoku') return { label: t('stats.fastest'), value: g.bestTimeMs != null ? formatClock(g.bestTimeMs) : '—' };
  if (id === 'make24') return { label: t('stats.solved'), value: formatNumber(g.totalScore) };
  return { label: t('stats.bestScore'), value: formatNumber(g.bestScore) };
}

function GameStatsCard({ id, data }) {
  const { t } = useI18n();
  const g = data?.games?.[id];
  const head = headlineFor(id, g, t);
  const isTime = GAMES[id].metric === 'time';
  const name = t(`games.${id}.name`);

  return (
    <article className={`card game-stats tint-${id}`}>
      <header className="game-stats-head">
        <GameIcon game={id} size="sm" />
        <div className="game-stats-title">
          <h3>{name}</h3>
          <span>
            {t('stats.games', { count: g?.gamesPlayed ?? 0 })}
            {g?.accuracy != null && ` · ${t('stats.accuracy', { value: formatPercent(g.accuracy) })}`}
          </span>
        </div>
        {head && (
          <div className="game-stats-headline">
            <span>{head.label}</span>
            <strong className="tabular">{head.value}</strong>
          </div>
        )}
      </header>

      {g?.gamesPlayed ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('stats.level')}</th>
                <th className="num">{t('stats.played')}</th>
                <th className="num">{isTime ? t('stats.bestTime') : t('stats.best')}</th>
                <th className="num">{isTime ? t('stats.avgTime') : t('stats.average')}</th>
                <th className="num">{isTime ? t('stats.mistakes') : t('stats.accuracyCol')}</th>
              </tr>
            </thead>
            <tbody>
              {DIFFICULTIES.map((level) => {
                const d = g.difficulties[level];
                const label = t(`difficulty.${level}`);
                if (!d) {
                  return (
                    <tr key={level} className="row-empty">
                      <td>{label}</td>
                      <td className="num">0</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                    </tr>
                  );
                }
                const mistakesPerGame = d.gamesPlayed ? d.totalMistakes / d.gamesPlayed : 0;
                return (
                  <tr key={level}>
                    <td>{label}</td>
                    <td className="num">{d.gamesPlayed}</td>
                    <td className="num strong">{isTime ? formatClock(d.bestTimeMs) : d.bestScore}</td>
                    <td className="num">{isTime ? formatClock(d.averageTimeMs) : formatNumber(d.averageScore)}</td>
                    <td className="num">
                      {isTime ? t('common.perGame', { value: formatNumber(mistakesPerGame) }) : formatPercent(d.accuracy)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="game-stats-empty">
          <span>{t('stats.noGames')}</span>
          <Link to={`/games/${id}`} className="btn btn-secondary btn-sm">
            {t('stats.play', { name })}
          </Link>
        </div>
      )}
    </article>
  );
}

function HistorySection() {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, hasMore: false, error: null, loadingMore: false });
  const requestId = useRef(0);
  const filters = [
    { value: '', label: t('stats.allGames') },
    ...GAME_ORDER.map((id) => ({ value: id, label: t(`games.${id}.name`) })),
  ];

  const fetchPage = useCallback(
    async (offset) => {
      const id = ++requestId.current;
      const append = offset > 0;
      setState((s) => (append ? { ...s, loadingMore: true, error: null } : { ...s, status: 'loading', error: null }));
      try {
        const page = await statsApi.history({ game: filter || undefined, limit: 10, offset });
        if (id !== requestId.current) return;
        setState((s) => ({
          status: 'success',
          items: append ? [...s.items, ...page.items] : page.items,
          total: page.total,
          hasMore: page.hasMore,
          error: null,
          loadingMore: false,
        }));
      } catch (error) {
        if (id !== requestId.current) return;
        setState((s) => (append ? { ...s, loadingMore: false, error } : { ...s, status: 'error', error, loadingMore: false }));
      }
    },
    [filter],
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  return (
    <section className="section">
      <div className="section-header history-header">
        <h2>{t('stats.history')}</h2>
        <SegmentedControl label={t('stats.filter')} options={filters} value={filter} onChange={setFilter} />
      </div>
      <div className="card">
        {state.status === 'loading' ? (
          <div className="result-list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="result-row">
                <Skeleton width={34} height={34} radius={10} />
                <div className="result-row-main">
                  <Skeleton width="35%" height={14} />
                  <Skeleton width="18%" height={12} style={{ marginTop: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : state.status === 'error' ? (
          <ErrorState title={t('stats.historyError')} error={state.error} onRetry={() => fetchPage(0)} />
        ) : state.items.length === 0 ? (
          <EmptyState
            icon={History}
            title={filter ? t('stats.historyEmptyGame', { name: t(`games.${filter}.name`) }) : t('stats.historyEmpty')}
          >
            {t('stats.historyEmptyBody')}
          </EmptyState>
        ) : (
          <>
            <div className="result-list">
              {state.items.map((item) => (
                <ResultRow key={item.id} item={item} />
              ))}
            </div>
            <div className="history-footer">
              <span className="subtle tabular">{t('stats.showing', { shown: state.items.length, total: state.total })}</span>
              {state.hasMore && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fetchPage(state.items.length)}
                  disabled={state.loadingMore}
                >
                  {state.loadingMore && <Spinner />} {t('stats.loadMore')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function StatsPage() {
  const { t, fmt } = useI18n();
  const { status, data, error, reload } = useAsync(() => statsApi.summary(), []);
  const loading = status === 'loading' && !data;

  return (
    <div className="container page">
      <header className="page-header">
        <div>
          <h1>{t('stats.title')}</h1>
          <p>{t('stats.subtitle')}</p>
        </div>
      </header>

      {status === 'error' ? (
        <div className="card">
          <ErrorState title={t('stats.error')} error={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="stat-grid stagger">
            <StatTile icon={Gamepad2} label={t('dashboard.gamesPlayed')} value={formatNumber(data?.totals.gamesPlayed ?? 0)} loading={loading} />
            <StatTile icon={Sigma} label={t('dashboard.totalScore')} value={formatNumber(data?.totals.totalScore ?? 0)} loading={loading} />
            <StatTile icon={Clock} label={t('stats.timeTrained')} value={fmt.duration(data?.totals.totalTimeMs ?? 0)} loading={loading} />
            <StatTile icon={Target} label={t('stats.make24Solved')} value={formatNumber(data?.games.make24.totalScore ?? 0)} loading={loading} />
          </div>

          <section className="section">
            <div className="section-header">
              <h2>{t('stats.byGame')}</h2>
            </div>
            <div className="game-stats-grid stagger">
              {GAME_ORDER.map((id) =>
                loading ? (
                  <div key={id} className="card game-stats">
                    <Skeleton height={34} width="50%" />
                    <Skeleton height={120} style={{ marginTop: 16 }} />
                  </div>
                ) : (
                  <GameStatsCard key={id} id={id} data={data} />
                ),
              )}
            </div>
          </section>
        </>
      )}

      <HistorySection />
    </div>
  );
}
