import { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { formatPrice, formatPercent, formatVolume, getBaseAsset } from '../utils/format';
import { getTickers } from '../utils/binanceApi';
import type { Ticker } from '../types';

type FilterTab = 'all' | 'gainers' | 'losers' | 'favorites';

export function MarketMovers() {
  const { setSymbol, exchange, triggerSignalFor, isFavorite } = useAppStore();
  const { subscribeTicker } = useSocket();
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tickerMapRef = useRef<Map<string, Ticker>>(new Map());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data: Ticker[] = await getTickers();
        if (!mounted) return;
        setTickers(data);
        data.forEach((t) => tickerMapRef.current.set(t.symbol, t));
        setLoading(false);
        setError('');
      } catch {
        if (mounted) { setError('Network error'); setLoading(false); }
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, [exchange]);

  // Real-time WebSocket updates for displayed tickers
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const activeSymbols = tickers.slice(0, 30).map(t => t.symbol);
    activeSymbols.forEach((sym) => {
      const unsub = subscribeTicker(sym, (data) => {
        const existing = tickerMapRef.current.get(data.symbol);
        if (existing) {
          tickerMapRef.current.set(data.symbol, {
            ...existing,
            lastPrice: data.lastPrice,
            priceChange: data.priceChange,
            priceChangePercent: data.priceChangePercent,
          });
          setTickers(prev => prev.map(t => t.symbol === data.symbol ? { ...t, lastPrice: data.lastPrice, priceChange: data.priceChange, priceChangePercent: data.priceChangePercent } : t));
        }
      });
      unsubs.push(unsub);
    });
    return () => { unsubs.forEach(u => u()); };
  }, [tickers.length, subscribeTicker]);

  const filtered = useMemo(() => {
    const MIN_VOLUME = 500000;
    const usdtPairs = tickers.filter(t =>
      t.symbol?.endsWith('USDT') && t.lastPrice > 0 && t.quoteVolume >= MIN_VOLUME
    );
    let result: Ticker[];
    switch (filter) {
      case 'gainers':
        result = usdtPairs.filter(t => t.priceChangePercent > 0)
          .sort((a, b) => b.priceChangePercent - a.priceChangePercent);
        break;
      case 'losers':
        result = usdtPairs.filter(t => t.priceChangePercent < 0)
          .sort((a, b) => a.priceChangePercent - b.priceChangePercent);
        break;
      case 'favorites':
        result = usdtPairs.filter(t => isFavorite(t.symbol))
          .sort((a, b) => b.quoteVolume - a.quoteVolume);
        break;
      default:
        result = usdtPairs.sort((a, b) => b.quoteVolume - a.quoteVolume);
    }
    return result.slice(0, 50);
  }, [tickers, filter, isFavorite]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
          <span className="text-[10px] text-text-muted">Loading market data...</span>
        </div>
      </div>
    );
  }

  if (error && tickers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs text-accent-red">{error}</div>
          <button onClick={() => window.location.reload()}
            className="text-[10px] text-accent-blue hover:underline mt-1">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-1 pb-2 border-b border-border-primary mb-2">
        {(['all', 'gainers', 'losers', 'favorites'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 text-[10px] font-medium rounded-lg transition-all ${
              filter === f ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted hover:text-text-secondary bg-bg-tertiary/50'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[9px] text-text-muted font-mono">{filtered.length} pairs</span>
      </div>

      {/* Table header */}
      <div className="flex items-center px-3 py-1.5 text-[10px] text-text-muted border-b border-border-primary">
        <span className="w-6 shrink-0">#</span>
        <span className="flex-1">Pair</span>
        <span className="w-20 text-right">Price</span>
        <span className="w-16 text-right">24h %</span>
        <span className="w-16 text-right">Volume</span>
      </div>

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <div className="text-2xl mb-2 opacity-30">
              {filter === 'favorites' ? '☆' : '📊'}
            </div>
            <div className="text-xs">
              {filter === 'favorites' ? 'No favorites yet' : filter === 'gainers' ? 'No gainers' : filter === 'losers' ? 'No losers' : 'No pairs'}
            </div>
            <div className="text-[10px] mt-1">
              {filter === 'favorites' ? 'Star a pair to add it' : 'Try a different filter'}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border-primary/30">
            {filtered.map((t, i) => {
              const isUp = t.priceChangePercent >= 0;
              return (
                <div key={t.symbol}
                  className="flex items-center px-3 py-2 hover:bg-bg-tertiary/50 cursor-pointer transition-colors group"
                  onClick={() => triggerSignalFor(t.symbol)}
                >
                  <span className="w-6 text-[10px] font-mono text-text-muted shrink-0">{i + 1}</span>
                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                    <div className="truncate">
                      <span className="text-xs font-medium text-text-primary">{getBaseAsset(t.symbol)}</span>
                      <span className="text-[9px] text-text-muted ml-0.5">/USDT</span>
                    </div>
                  </div>
                  <span className="w-20 text-right text-xs font-mono text-text-primary smooth-update">{formatPrice(t.lastPrice)}</span>
                  <span className={`w-16 text-right text-xs font-mono font-medium ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                    {formatPercent(t.priceChangePercent)}
                  </span>
                  <span className="w-16 text-right text-[10px] font-mono text-text-secondary">{formatVolume(t.quoteVolume)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}