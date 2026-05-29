import { useRef, useCallback } from 'react';

/**
 * Hook to track price changes and return flash state
 * Returns 'up' | 'down' | null for CSS flash classes
 */
export function usePriceFlash() {
  const prevPrices = useRef<Map<string, number>>(new Map());
  const flashTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const flashStates = useRef<Map<string, 'up' | 'down' | null>>(new Map());

  const getFlash = useCallback((symbol: string, price: number): 'up' | 'down' | null => {
    const prev = prevPrices.current.get(symbol);
    prevPrices.current.set(symbol, price);

    if (prev === undefined || prev === price) return flashStates.current.get(symbol) || null;

    const direction = price > prev ? 'up' : 'down';
    flashStates.current.set(symbol, direction);

    // Clear previous timer
    const existing = flashTimers.current.get(symbol);
    if (existing) clearTimeout(existing);

    // Reset flash after 500ms
    flashTimers.current.set(symbol, setTimeout(() => {
      flashStates.current.set(symbol, null);
    }, 500));

    return direction;
  }, []);

  const reset = useCallback((symbol: string) => {
    prevPrices.current.delete(symbol);
    flashStates.current.delete(symbol);
    const t = flashTimers.current.get(symbol);
    if (t) clearTimeout(t);
    flashTimers.current.delete(symbol);
  }, []);

  return { getFlash, reset };
}
