import { useState, useEffect } from 'react';
import { formatPrice, formatPercent } from '../utils/format';
import type { Ticker } from '../types';

const TOP_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];

export default function MarketOverview() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [movingTickers, setMovingTickers] = useState<Ticker[]>([]);

  useEffect(() => {
    let active = true;
    const fetchTickers = async () => {
      try {
        const res = await fetch('/api/binance/tickers');
        if (!res.ok) return;
        const all: Ticker[] = await res.json();
        if (!active) return;
        const top = all.filter(t => TOP_SYMBOLS.includes(t.symbol));
        setTickers(top);
      } catch {}
    };
    fetchTickers();
    const id = window.setInterval(fetchTickers, 5000);

    const fetchMoving = async () => {
      try {
        const res = await fetch('/api/binance/tickers');
        if (!res.ok) return;
        const all: Ticker[] = await res.json();
        if (!active) return;
        const usdt = all.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent)).slice(0, 20);
        setMovingTickers(usdt);
      } catch {}
    };
    fetchMoving();
    const id2 = window.setInterval(fetchMoving, 10000);

    return () => { active = false; window.clearInterval(id); window.clearInterval(id2); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Scrolling ticker */}
      <div className="h-9 overflow-hidden bg-bg-secondary/80 border-b border-border-primary relative">
        <div className="flex items-center h-full animate-marquee">
          {[...movingTickers, ...movingTickers].map((t, i) => (
            <span key={`${t.symbol}-${i}`}
              className="flex items-center gap-2 px-4 text-[11px] font-mono whitespace-nowrap shrink-0 border-r border-border-primary/50 last:border-r-0">
              <span className="font-semibold text-text-primary">{t.symbol.replace('USDT', '')}</span>
              <span className="text-text-primary">${formatPrice(t.lastPrice)}</span>
              <span className={`${t.priceChangePercent >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {formatPercent(t.priceChangePercent)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-2 gap-3 p-6 overflow-y-auto content-start">
        {tickers.map(t => (
          <div key={t.symbol}
            className="glass p-4 rounded-xl hover:bg-bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-text-primary">{t.symbol.replace('USDT', '')}/USDT</span>
              <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded ${
                t.priceChangePercent >= 0 ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
              }`}>
                {formatPercent(t.priceChangePercent)}
              </span>
            </div>
            <div className="text-lg font-mono font-bold text-text-primary">
              ${formatPrice(t.lastPrice)}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-text-muted">
              <span>24h H: ${formatPrice(t.highPrice)}</span>
              <span>L: ${formatPrice(t.lowPrice)}</span>
            </div>
            <div className="mt-1 h-1 bg-bg-primary rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                t.priceChangePercent >= 0 ? 'bg-accent-green' : 'bg-accent-red'
              }`}
                style={{ width: `${Math.min(100, Math.abs(t.priceChangePercent) * 4)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
