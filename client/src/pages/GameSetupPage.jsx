import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, ChevronLeft, Play } from 'lucide-react';
import { sessionsApi, statsApi } from '../api/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { DIFFICULTIES, GAMES, isDifficulty } from '../games/catalog.js';
import { GameIcon } from '../components/Icons.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { InlineError } from '../components/States.jsx';
import { formatClock } from '../utils/format.js';
import NotFoundPage from './NotFoundPage.jsx';
import '../styles/game.css';

const storageKey = (gameId) => `cortex:difficulty:${gameId}`;

function initialDifficulty(gameId, params) {
  const fromUrl = params.get('difficulty');
  if (isDifficulty(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(storageKey(gameId));
    if (isDifficulty(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'easy';
}

function BestFor({ metric, stats }) {
  const { t } = useI18n();
  if (!stats || stats.gamesPlayed === 0) return <span className="option-best">{t('setup.notPlayed')}</span>;
  if (metric === 'time') {
    return (
      <span className="option-best">
        <strong className="tabular">{stats.bestTimeMs != null ? formatClock(stats.bestTimeMs) : '—'}</strong>
        {t('setup.bestTime')}
      </span>
    );
  }
  return (
    <span className="option-best">
      <strong className="tabular">{stats.bestScore}</strong>
      {t('setup.bestScore')}
    </span>
  );
}

export default function GameSetupPage() {
  const { gameId } = useParams();
  const game = GAMES[gameId];
  const { t, fmt, errorText } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [difficulty, setDifficulty] = useState(() => initialDifficulty(gameId, params));
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const stats = useAsync(() => statsApi.summary(), []);
  const active = useAsync(
    () => (gameId === 'sudoku' ? sessionsApi.active('sudoku') : Promise.resolve(null)),
    [gameId],
  );

  if (!game) return <NotFoundPage />;

  const choose = (d) => {
    setDifficulty(d);
    try {
      localStorage.setItem(storageKey(gameId), d);
    } catch {
      /* storage unavailable */
    }
  };

  async function start() {
    if (starting) return;
    setConfirmNew(false);
    setStarting(true);
    setStartError(null);
    try {
      const session = await sessionsApi.start(gameId, difficulty);
      navigate(`/games/${gameId}/play/${session.id}`);
    } catch (err) {
      setStartError(err);
      setStarting(false);
    }
  }

  const resume = active.data;
  const perDifficulty = stats.data?.games?.[gameId]?.difficulties;
  const level = (id) => t(`difficulty.${id}`);

  return (
    <div className={`container page tint-${gameId}`}>
      <Link to="/" className="back-link">
        <ChevronLeft size={16} /> {t('setup.back')}
      </Link>

      <div className="setup fade-in">
        <section className="setup-intro">
          <GameIcon game={gameId} size="lg" />
          <h1>{t(`games.${gameId}.name`)}</h1>
          <p>{t(`games.${gameId}.description`)}</p>
          <div className="setup-meta">
            {t(`games.${gameId}.meta`).map((m) => (
              <span key={m} className="chip">
                {m}
              </span>
            ))}
            <span className="chip">{game.metric === 'time' ? t('setup.rankedTime') : t('setup.rankedScore')}</span>
          </div>
          <h2 className="rules-title">{t('setup.howToPlay')}</h2>
          <ol className="rules">
            {t(`games.${gameId}.rules`).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </section>

        <section className="card setup-panel" aria-labelledby="difficulty-title">
          <h2 id="difficulty-title">{t('setup.chooseDifficulty')}</h2>
          <p className="panel-sub">{t('setup.panelSub')}</p>

          {resume && (
            <div className="resume">
              <div className="resume-body">
                <strong>{t('setup.resumeTitle')}</strong>
                {t('setup.resumeDetail', {
                  level: level(resume.difficulty),
                  filled: resume.state.filled,
                  blanks: resume.state.blanks,
                  when: fmt.relative(resume.startedAt),
                })}
              </div>
              <Link to={`/games/${gameId}/play/${resume.id}`} className="btn btn-primary btn-sm">
                {t('setup.continue')} <ArrowRight />
              </Link>
            </div>
          )}

          <div className="options" role="radiogroup" aria-labelledby="difficulty-title">
            {DIFFICULTIES.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={difficulty === id}
                className="option"
                onClick={() => choose(id)}
              >
                <span className="option-radio" />
                <span className="option-body">
                  <span className="option-label">{level(id)}</span>
                  <span className="option-desc">{t(`games.${gameId}.difficulties.${id}`)}</span>
                </span>
                {stats.status === 'success' && <BestFor metric={game.metric} stats={perDifficulty?.[id]} />}
              </button>
            ))}
          </div>

          <InlineError>{startError && errorText(startError)}</InlineError>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => (resume ? setConfirmNew(true) : start())}
            disabled={starting}
            style={{ marginTop: startError ? 14 : 0 }}
          >
            {starting ? <span className="spinner" /> : <Play />}
            {starting ? t('setup.preparing') : t('setup.start', { level: level(difficulty) })}
          </button>
          <p className="setup-note">{game.metric === 'time' ? t('setup.noteTime') : t('setup.noteScore')}</p>
        </section>
      </div>

      <ConfirmDialog
        open={confirmNew}
        title={t('setup.newTitle')}
        confirmLabel={t('setup.newConfirm')}
        cancelLabel={t('setup.newCancel')}
        tone="danger"
        onConfirm={start}
        onCancel={() => setConfirmNew(false)}
      >
        {t('setup.newBody', { level: resume ? level(resume.difficulty) : '' })}
      </ConfirmDialog>
    </div>
  );
}
