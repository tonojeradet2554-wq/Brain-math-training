import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks loading / success / error.
 * Out-of-date responses (from a previous dependency value or after unmount) are ignored.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ status: 'loading', data: undefined, error: null });
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ status: 'loading', data: s.data, error: null }));
    try {
      const data = await loaderRef.current();
      if (id === requestId.current) setState({ status: 'success', data, error: null });
    } catch (error) {
      if (id === requestId.current) setState({ status: 'error', data: undefined, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    return () => {
      requestId.current++;
    };
  }, [run]);

  return { ...state, reload: run };
}
