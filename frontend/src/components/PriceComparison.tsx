import { useState, useEffect } from 'react';
import { fetchPriceComparison } from '../utils/api';
import { formatPrice, formatPercent } from '../utils/format';
import { useAppStore } from '../stores/useAppStore';

interface ExchangePrice {
  price: number;
  change24h: number;
  volume: number;
  error?: string;
}

interface ComparisonData {
  symbol: string;
  exchanges: Record<string, ExchangePrice>;
  bestBid?: { name: string; price: number };
  bestAsk?: { name: string; price: number };
  spread?: number;
  spreadPercent?: number;
}

const EXCHANGE_COLORS: Record<string, string> = {
  binance: '#F0B90B',
  bybit: '#F7A600',
  okx: '#FFFFFF',
  kucoin: '#23AF44',
  coinbase: '#0052FF',
  kraken: '#5841D8',
};

export function PriceComparison() {
  const { symbol } = useAppStore();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchPriceComparison(symbol);
      setData(result);
    } catch (err) {
      console.error('Price comparison error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Cross-Exchange Prices</h3>
        <button onClick={load} className="text-[10px] text-text-muted hover:text-text-secondary transition-colors">
          Refresh
        </button>
      </div>

      {/* Exchange prices */}
      <div className="space-y-1.5">
        {Object.entries(data.exchanges).map(([name, ex]) => {
          if (ex.error) {
            return (
              <div key={name} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-bg-primary/30">
                <span className="text-xs capitalize" style={{ color: EXCHANGE_COLORS[name] }}>{name}</span>
                <span className="text-[10px] text-text-muted">Error</span>
              </div>
            );
          }

          const isBest = data.bestBid?.name === name || data.bestAsk?.name === name;

          return (
            <div
              key={name}
              className={`flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                isBest ? 'bg-accent-green/5 border border-accent-green/20' : 'bg-bg-primary/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[name] }} />
                <span className="text-xs capitalize font-medium" style={{ color: EXCHANGE_COLORS[name] }}>{name}</span>
                {data.bestBid?.name === name && (
                  <span className="text-[9px] bg-accent-green/10 text-accent-green px-1.5 py-0.5 rounded">Best</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-text-primary">${formatPrice(ex.price)}</span>
                <span className={`text-[10px] font-mono ${ex.change24h >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {formatPercent(ex.change24h)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Spread info */}
      {data.spread !== undefined && data.spreadPercent !== undefined && (
        <div className="bg-bg-primary/30 rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-muted">Price Spread</span>
            <span className="text-xs font-mono text-accent-yellow">{data.spreadPercent.toFixed(4)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">Best Bid</span>
            <span className="text-[10px] font-mono text-accent-green">
              {data.bestBid?.name}: ${formatPrice(data.bestBid?.price || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">Best Ask</span>
            <span className="text-[10px] font-mono text-accent-red">
              {data.bestAsk?.name}: ${formatPrice(data.bestAsk?.price || 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
