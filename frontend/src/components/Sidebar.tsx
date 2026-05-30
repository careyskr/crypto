import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { fetchExchangeTickers } from '../utils/api';
import { formatPrice, formatPercent, formatVolume, getBaseAsset } from '../utils/format';
import { IndicatorsPanel } from './IndicatorsPanel';
import type { Ticker } from '../types';

export function Sidebar() {
  const { setSymbol, toggleFavorite, isFavorite, exchange, triggerSignalFor } = useAppStore();
  const { subscribeTicker } = useSocket();
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [filter, setFilter] = useState<'all' | 'favorites' | 'gainers' | 'losers'>('all');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'market' | 'indicators'>('market');
  const tickerMapRef = useRef<Map<string, Ticker>>(new Map());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await fetchExchangeTickers(exchange);
        if (mounted) {
          setTickers(data);
          data.forEach((t: Ticker) => tickerMapRef.current.set(t.symbol, t));
        }
      } catch {}
    };
    load();
    const interval = setInterval(load, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [exchange]);

  // Real-time price updates for sidebar tickers
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const topSymbols = tickers.slice(0, 30).map(t => t.symbol);

    topSymbols.forEach((sym) => {
      const unsub = subscribeTicker(sym, (data) => {
        const existing = tickerMapRef.current.get(data.symbol);
        if (existing) {
          tickerMapRef.current.set(data.symbol, {
            ...existing,
            lastPrice: data.lastPrice,
            priceChange: data.priceChange,
            priceChangePercent: data.priceChangePercent,
          });
          setTickers(Array.from(tickerMapRef.current.values()));
        }
      });
      unsubs.push(unsub);
    });

    return () => { unsubs.forEach(u => u()); };
  }, [tickers.length, subscribeTicker]);

  const filtered = tickers
    .filter((t) => {
      const MIN_VOLUME = 500000;
      if (t.quoteVolume < MIN_VOLUME || t.lastPrice <= 0 || !t.symbol?.endsWith('USDT')) return false;
      if (search) {
        const q = search.toUpperCase();
        return t.symbol.includes(q) || getBaseAsset(t.symbol).includes(q);
      }
      if (filter === 'favorites') return isFavorite(t.symbol);
      if (filter === 'gainers') return t.priceChangePercent > 0;
      if (filter === 'losers') return t.priceChangePercent < 0;
      return true;
    })
    .sort((a, b) => {
      if (filter === 'gainers') return b.priceChangePercent - a.priceChangePercent;
      if (filter === 'losers') return a.priceChangePercent - b.priceChangePercent;
      return b.quoteVolume - a.quoteVolume;
    })
    .slice(0, 50);

  return (
    <aside className="w-72 border-r border-border-primary bg-bg-secondary/50 flex flex-col shrink-0 overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-border-primary">
        {(['market', 'indicators'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted hover:text-text-secondary'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'indicators' ? (
        <div className="flex-1 overflow-y-auto">
          <IndicatorsPanel />
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-2 border-b border-border-primary">
            {(['all', 'favorites', 'gainers', 'losers'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  filter === f ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2 border-b border-border-primary">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-bg-primary border border-border-primary rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50"
              />
            </div>
          </div>

          {/* Table header */}
          <div className="flex items-center px-3 py-1.5 text-[10px] text-text-muted border-b border-border-primary">
            <span className="flex-1">Pair</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-16 text-right">24h %</span>
            <span className="w-16 text-right">Volume</span>
          </div>

          {/* Ticker list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map((t) => {
              const isUp = t.priceChangePercent >= 0;
              return (
                <div
                  key={t.symbol}
                  className="flex items-center px-3 py-2 hover:bg-bg-tertiary/50 cursor-pointer transition-colors group"
                  onClick={() => triggerSignalFor(t.symbol)}
                >
                  <div className="flex-1 flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(t.symbol); }}
                      className={`text-[10px] transition-colors ${isFavorite(t.symbol) ? 'text-accent-yellow' : 'text-text-muted opacity-0 group-hover:opacity-100'}`}
                    >
                      {isFavorite(t.symbol) ? '★' : '☆'}
                    </button>
                    <div>
                      <div className="text-xs font-medium text-text-primary">{getBaseAsset(t.symbol)}</div>
                      <div className="text-[10px] text-text-muted">/USDT</div>
                    </div>
                  </div>
                  <span className="w-20 text-right text-xs font-mono text-text-primary smooth-update">{formatPrice(t.lastPrice)}</span>
                  <span className={`w-16 text-right text-xs font-mono font-medium ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>{formatPercent(t.priceChangePercent)}</span>
                  <span className="w-16 text-right text-[10px] font-mono text-text-secondary">{formatVolume(t.quoteVolume)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
