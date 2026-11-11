import { Link, useSearchParams } from 'react-router';
import { Trophy } from 'lucide-react';
import { leaderboardApi } from '../api/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { DIFFICULTIES, GAMES, GAME_ORDER, isDifficulty } from '../games/catalog.js';
import { SegmentedControl } from '../components/Controls.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { cx, formatClock } from '../utils/format.js';
import '../styles/stats.css';

function Row({ entry, metric, highlight }) {
  const { t } = useI18n();
  return (
    <tr className={cx(highlight && 'is-me')}>
      <td className="rank-cell">
        <span className={cx('rank', entry.rank <= 3 && `rank-${entry.rank}`)}>{entry.rank}</span>
      </td>
      <td>
        <div className="player">
          <span className="avatar">{[...entry.username][0]}</span>
          <span className="player-name">{entry.username}</span>
          {highlight && <span className="chip you">{t('leaderboard.you')}</span>}
        </div>
      </td>
      <td className="num strong">{metric === 'time' ? formatClock(entry.bestTimeMs) : entry.bestScore}</td>
      <td className="num hide-xs">{entry.gamesPlayed}</td>
    </tr>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const game = GAMES[params.get('game')] ? params.get('game') : 'sudoku';
  const difficulty = isDifficulty(params.get('difficulty')) ? params.get('difficulty') : 'easy';
  const update = (patch) => setParams({ game, difficulty, ...patch }, { replace: true });

  const { status, data, error, reload } = useAsync(() => leaderboardApi.get(game, difficulty), [game, difficulty]);
  const metric = GAMES[game].metric;
  const meOutsideTop = data?.me && !data.entries.some((e) => e.isMe);
  const name = t(`games.${game}.name`);
  const level = t(`difficulty.${difficulty}`);

  return (
    <div className="container page">
      <header className="page-header">
        <div>
          <h1>{t('leaderboard.title')}</h1>
          <p>{metric === 'time' ? t('leaderboard.subtitleTime') : t('leaderboard.subtitleScore')}</p>
        </div>
      </header>

      <div className="board-filters">
        <SegmentedControl
          label={t('leaderboard.game')}
          options={GAME_ORDER.map((id) => ({ value: id, label: t(`games.${id}.name`) }))}
          value={game}
          onChange={(v) => update({ game: v })}
        />
        <SegmentedControl
          label={t('leaderboard.difficulty')}
          options={DIFFICULTIES.map((id) => ({ value: id, label: t(`difficulty.${id}`) }))}
          value={difficulty}
          onChange={(v) => update({ difficulty: v })}
        />
      </div>

      <div className="card board">
        {status === 'loading' ? (
          <div className="board-skeleton">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="board-skeleton-row">
                <Skeleton width={28} height={28} radius={8} />
                <Skeleton width={30} height={30} radius={15} />
                <Skeleton width="30%" height={14} />
                <Skeleton width={48} height={14} style={{ marginLeft: 'auto' }} />
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <ErrorState title={t('leaderboard.error')} error={error} onRetry={reload} />
        ) : data.entries.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t('leaderboard.emptyTitle')}
            action={
              <Link to={`/games/${game}?difficulty=${difficulty}`} className="btn btn-primary btn-sm">
                {t('leaderboard.emptyCta', { name, level })}
              </Link>
            }
          >
            {t('leaderboard.emptyBody', { name, level })}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table board-table">
                <thead>
                  <tr>
                    <th className="rank-cell">{t('leaderboard.rank')}</th>
                    <th>{t('leaderboard.player')}</th>
                    <th className="num">{metric === 'time' ? t('leaderboard.bestTime') : t('leaderboard.bestScore')}</th>
                    <th className="num hide-xs">{t('leaderboard.games')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <Row key={entry.rank} entry={entry} metric={metric} highlight={entry.isMe} />
                  ))}
                  {meOutsideTop && (
                    <>
                      <tr className="gap-row" aria-hidden="true">
                        <td colSpan={4}>···</td>
                      </tr>
                      <Row entry={{ ...data.me, username: user.username }} metric={metric} highlight />
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="board-footer subtle">
              {t('leaderboard.ranked', { count: data.totalPlayers })}
              {!data.me && t('leaderboard.notRanked')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
