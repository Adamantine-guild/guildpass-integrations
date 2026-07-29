import { useEffect, useState } from 'react';

/**
 * Returns a copy of `value` that only updates `delayMs` after the last
 * change — the input driving `value` itself should update immediately;
 * only downstream consumers of the returned value see the delay.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
