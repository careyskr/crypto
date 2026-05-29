import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { formatPrice, formatPercent } from '../utils/format';

interface TickerData {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  flash?: 'up' | 'down' | null;
}

const TOP_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'MATICUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT'];

export const TickerBar = memo(function TickerBar() {
  const { setSymbol } = useAppStore();
  const [tickers, setTickers] = useState<Map<string, TickerData>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();
  const prevPrices = useRef<Map<string, number>>(new Map());
  const flashTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    const connect = () => {
      const streams = TOP_SYMBOLS.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onopen = () => console.log('TickerBar WS connected');

      ws.onmessage = (event) => {
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
                setTickers(prev => {
                  const next = new Map(prev);
                  const t = next.get(symbol);
                  if (t) next.set(symbol, { ...t, flash: null });
                  return next;
                });
              }, 600));
            }

            setTickers(prev => {
              const next = new Map(prev);
              next.set(symbol, {
                symbol,
                lastPrice: price,
                priceChangePercent: parseFloat(d.P),
                quoteVolume: parseFloat(d.q),
                flash,
              });
              return next;
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        console.log('TickerBar WS disconnected');
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
  }, []);

  const handleClick = useCallback((symbol: string) => {
    setSymbol(symbol);
  }, [setSymbol]);

  const tickerArray = Array.from(tickers.values())
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, 15);

  if (tickerArray.length === 0) {
    return (
      <div className="h-10 flex items-center border-b border-border-primary bg-bg-secondary/50 shrink-0 px-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
          <span className="text-xs text-text-muted">Connecting to market data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-10 flex items-center border-b border-border-primary bg-bg-secondary/50 overflow-x-auto shrink-0 px-2 gap-0.5">
      {tickerArray.map((t) => {
        const isUp = t.priceChangePercent >= 0;
        const flashClass = t.flash === 'up' ? 'flash-up' : t.flash === 'down' ? 'flash-down' : '';

        return (
          <button
            key={t.symbol}
            onClick={() => handleClick(t.symbol)}
            className={`flex items-center gap-2 px-3 py-1 rounded-md hover:bg-bg-tertiary/50 transition-colors shrink-0 group ${flashClass}`}
          >
            <span className="text-xs font-mono font-medium text-text-secondary group-hover:text-text-primary transition-colors">
              {t.symbol.replace('USDT', '')}
            </span>
            <span className={`text-xs font-mono font-bold smooth-update ${t.flash === 'up' ? 'price-flash-up' : t.flash === 'down' ? 'price-flash-down' : 'text-text-primary'}`}>
              {formatPrice(t.lastPrice)}
            </span>
            <span className={`text-[10px] font-mono font-medium ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
              {formatPercent(t.priceChangePercent)}
            </span>
          </button>
        );
      })}
    </div>
  );
});
