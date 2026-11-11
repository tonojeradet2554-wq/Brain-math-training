import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionsApi } from '../../api/endpoints.js';
import { useServerClock } from '../../hooks/useClock.js';

/**
 * Owns one game session's client-side copy. The server is the source of truth:
 * every response carries the full public session view, which replaces ours.
 */
export function useGameSession(sessionId) {
  const clock = useServerClock();
  const [session, setSession] = useState(null);
  const [loadState, setLoadState] = useState({ status: 'loading', error: null });
  const finishing = useRef(null);

  const apply = useCallback(
    (next) => {
      if (!next) return;
      clock.sync(next.serverNow);
      setSession((prev) => {
        if (!prev || prev.id !== next.id) return next;
        if (prev.status !== 'active') return prev.result || !next.result ? prev : next; // terminal state wins
        if (next.status !== 'active') return next;
        // Responses can arrive out of order; never go back in time.
        return next.attempts >= prev.attempts ? next : prev;
      });
    },
    [clock],
  );

  const load = useCallback(async () => {
    setLoadState({ status: 'loading', error: null });
    try {
      apply(await sessionsApi.get(sessionId));
      setLoadState({ status: 'ready', error: null });
    } catch (error) {
      setLoadState({ status: 'error', error });
    }
  }, [sessionId, apply]);

  useEffect(() => {
    setSession(null);
    finishing.current = null;
    load();
  }, [load]);

  const answer = useCallback(
    async (body) => {
      try {
        const res = await sessionsApi.answer(sessionId, body);
        apply(res.session);
        return res;
      } catch (err) {
        if (err.data?.session) apply(err.data.session);
        throw err;
      }
    },
    [sessionId, apply],
  );

  /** Single-flight: repeated calls share one request, so a round is never finished twice. */
  const finish = useCallback(() => {
    finishing.current ??= sessionsApi
      .finish(sessionId)
      .then((s) => {
        apply(s);
        return s;
      })
      .catch((err) => {
        finishing.current = null;
        if (err.data?.session) apply(err.data.session);
        throw err;
      });
    return finishing.current;
  }, [sessionId, apply]);

  const abandon = useCallback(async () => {
    const s = await sessionsApi.abandon(sessionId);
    apply(s);
    return s;
  }, [sessionId, apply]);

  return { session, loadState, reload: load, clock, answer, finish, abandon };
}
