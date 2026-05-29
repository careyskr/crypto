import { useEffect, useRef, useCallback, useState } from 'react';

interface TickerData {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
  exchange?: string;
  flash?: 'up' | 'down' | null;
}

interface UseRealtimeMarketOptions {
  symbols: string[];
  exchange?: string;
  onUpdate?: (data: TickerData) => void;
}

/**
 * High-performance real-time market data hook
 * Uses a single WebSocket connection for multiple symbols
 * Includes price flash detection and auto-reconnect
 */
export function useRealtimeMarket({ symbols, exchange = 'binance', onUpdate }: UseRealtimeMarketOptions) {
  const [tickers, setTickers] = useState<Map<string, TickerData>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();
  const prevPrices = useRef<Map<string, number>>(new Map());
  const flashTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const updateTicker = useCallback((data: TickerData) => {
    const prev = prevPrices.current.get(data.symbol);
    prevPrices.current.set(data.symbol, data.lastPrice);

    // Flash detection
    let flash: 'up' | 'down' | null = null;
    if (prev !== undefined && prev !== data.lastPrice) {
      flash = data.lastPrice > prev ? 'up' : 'down';
      // Clear previous flash timer
      const existing = flashTimers.current.get(data.symbol);
      if (existing) clearTimeout(existing);
      // Reset flash after 600ms
      flashTimers.current.set(data.symbol, setTimeout(() => {
        setTickers(prev => {
          const next = new Map(prev);
          const t = next.get(data.symbol);
          if (t) next.set(data.symbol, { ...t, flash: null });
          return next;
        });
      }, 600));
    }

    setTickers(prev => {
      const next = new Map(prev);
      next.set(data.symbol, { ...data, flash });
      return next;
    });

    onUpdate?.(data);
  }, [onUpdate]);

  useEffect(() => {
    if (symbols.length === 0) return;

    const connect = () => {
      // Build stream URL for Binance
      const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onopen = () => console.log('Market WS connected');

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data || msg;
          if (d.e === '24hrTicker') {
            updateTicker({
              symbol: d.s,
              lastPrice: parseFloat(d.c),
              priceChange: parseFloat(d.p),
              priceChangePercent: parseFloat(d.P),
              volume: parseFloat(d.v),
              quoteVolume: parseFloat(d.q),
              highPrice: parseFloat(d.h),
              lowPrice: parseFloat(d.l),
              exchange,
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        console.log('Market WS disconnected, reconnecting...');
        reconnectRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      flashTimers.current.forEach(t => clearTimeout(t));
    };
  }, [symbols.join(','), exchange, updateTicker]);

  return { tickers };
}
