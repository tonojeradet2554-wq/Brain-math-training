import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Tracks the offset between this device's clock and the server's, so countdowns
 * show the server's deadline even if the device clock is wrong.
 */
export function useServerClock() {
  const offset = useRef(0);
  const sync = useCallback((serverNow) => {
    if (typeof serverNow === 'number') offset.current = serverNow - Date.now();
  }, []);
  const now = useCallback(() => Date.now() + offset.current, []);
  return useMemo(() => ({ sync, now }), [sync, now]);
}

/** Re-renders every `interval` ms while active and returns now(). Cleans up on unmount. */
export function useNow(now, active, interval = 250) {
  const [value, setValue] = useState(() => now());
  useEffect(() => {
    if (!active) return undefined;
    setValue(now());
    const id = setInterval(() => setValue(now()), interval);
    return () => clearInterval(id);
  }, [now, active, interval]);
  return active ? value : now();
}

/** Calls onExpire once when the deadline passes (precise setTimeout, not polling). */
export function useDeadline(deadline, now, active, onExpire) {
  const callback = useRef(onExpire);
  callback.current = onExpire;
  useEffect(() => {
    if (!active || deadline == null) return undefined;
    let timer;
    const check = () => {
      const remaining = deadline - now();
      if (remaining <= 0) callback.current();
      else timer = setTimeout(check, Math.min(remaining, 1000));
    };
    check();
    return () => clearTimeout(timer);
  }, [deadline, now, active]);
}
