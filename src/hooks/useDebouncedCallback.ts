import { useCallback, useEffect, useRef } from "react";

/// <summary>
/// Returns a debounced callback that flushes any pending invocation on unmount.
/// </summary>
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Args | null>(null);
  fnRef.current = fn;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pendingRef.current) {
      return;
    }
    const args = pendingRef.current;
    pendingRef.current = null;
    fnRef.current(...args);
  }, []);

  const debounced = useCallback(
    (...args: Args) => {
      pendingRef.current = args;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingRef.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay],
  );

  useEffect(() => () => flush(), [flush]);

  return { debounced, flush };
}
