import { useState, useEffect, useRef, memo } from 'react';
import { formatPrice, formatPercent } from '../utils/format';
import { useAppStore } from '../stores/useAppStore';

interface TickerData {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  flash?: 'up' | 'down' | null;
}

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'MATICUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT',
  'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT', 'PEPEUSDT',
];

export const MarqueeTicker = memo(function MarqueeTicker() {
  const { triggerSignalFor } = useAppStore();
  const [tickers, setTickers] = useState<Map<string, TickerData>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();
  const prevPrices = useRef<Map<string, number>>(new Map());
  const flashTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      const streams = SYMBOLS.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data || msg;
          if (d.e === '24hrTicker') {
            const symbol = d.s;
            const price = parseFloat(d.c);
            const prev = prevPrices.current.get(symbol);
            prevPrices.current.set(symbol, price);

            let flash: 'up' | 'down' | null = null;
            if (prev !== undefined && prev !== price) {
              flash = price > prev ? 'up' : 'down';
              const existing = flashTimers.current.get(symbol);
              if (existing) clearTimeout(existing);
              flashTimers.current.set(symbol, setTimeout(() => {
                setTickers(p => { const n = new Map(p); const t = n.get(symbol); if (t) n.set(symbol, { ...t, flash: null }); return n; });
              }, 500));
            }

            setTickers(p => { const n = new Map(p); n.set(symbol, { symbol, lastPrice: price, priceChangePercent: parseFloat(d.P), flash }); return n; });
          }
        } catch {}
      };

      ws.onclose = () => { if (!cancelled) reconnectRef.current = setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      cancelled = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      flashTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const sorted = Array.from(tickers.values()).sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol));
  if (sorted.length === 0) return null;

  // Duplicate for seamless loop
  const items = [...sorted, ...sorted, ...sorted];

  return (
    <div className="h-8 border-b border-border-primary bg-bg-secondary/80 backdrop-blur-xl overflow-hidden shrink-0 relative">
      {/* Gradient fades */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-bg-secondary to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-bg-secondary to-transparent z-10" />

      <div className="flex items-center h-full animate-marquee whitespace-nowrap">
        {items.map((t, i) => {
          const isUp = t.priceChangePercent >= 0;
          const flashClass = t.flash === 'up' ? 'flash-up' : t.flash === 'down' ? 'flash-down' : '';

          return (
            <button key={`${t.symbol}-${i}`} onClick={() => triggerSignalFor(t.symbol)}
              className={`flex items-center gap-1.5 px-4 shrink-0 ${flashClass} hover:bg-accent-blue/5 transition-colors cursor-pointer`}>
              <span className="text-[10px] font-mono font-semibold text-accent-cyan">{t.symbol.replace('USDT', '')}</span>
              <span className={`text-[10px] font-mono font-bold smooth-update ${t.flash === 'up' ? 'text-accent-green' : t.flash === 'down' ? 'text-accent-red' : 'text-text-primary'}`}>
                {formatPrice(t.lastPrice)}
              </span>
              <span className={`text-[9px] font-mono font-medium ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                {isUp ? '▲' : '▼'} {formatPercent(t.priceChangePercent)}
              </span>
              <span className="text-text-muted/30 mx-2">|</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
