import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTicker as getBinanceTicker, getTickers } from '../utils/binanceApi';
import { formatPrice, formatPercent, formatVolume, formatSymbol, getBaseAsset } from '../utils/format';
import { ChartPanel } from './ChartPanel';
import { OrderBook } from './OrderBook';
import { SignalPanel } from './SignalPanel';
import type { Ticker } from '../types';

type MobileTab = 'market' | 'chart' | 'orderbook' | 'signals';

function MobileHeader({ symbol }: { symbol: string }) {
  const [ticker, setTicker] = useState<any>(null);
  const { setSearchOpen } = useAppStore();

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      try { if (active) setTicker(await getBinanceTicker(symbol)); } catch {}
    };
    fetch();
    const id = setInterval(fetch, 5000);
    return () => { active = false; clearInterval(id); };
  }, [symbol]);

  const isUp = (ticker?.priceChangePercent ?? 0) >= 0;

  return (
    <div className="px-4 pt-3 pb-2 bg-bg-primary border-b border-border-primary">
      <div className="flex items-center justify-between mb-1">
        <button onClick={() => setSearchOpen(true)} className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-text-primary">{formatSymbol(symbol)}</span>
          <svg className="w-3.5 h-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 9l-7 7-7-7"/></svg>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <span className={`text-lg font-bold font-mono ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
              ${formatPrice(ticker?.lastPrice ?? 0)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-semibold font-mono ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
            {isUp ? '▲' : '▼'} {formatPercent(ticker?.priceChangePercent ?? 0)}
          </span>
          <span className="text-text-muted">Vol {formatVolume(ticker?.quoteVolume ?? 0)}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted font-mono">
          <span>H <span className="text-text-secondary">${formatPrice(ticker?.highPrice ?? 0)}</span></span>
          <span>L <span className="text-text-secondary">${formatPrice(ticker?.lowPrice ?? 0)}</span></span>
        </div>
      </div>
    </div>
  );
}

function MarketList() {
  const { setSymbol, symbol, triggerSignalFor, toggleFavorite, isFavorite } = useAppStore();
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [filter, setFilter] = useState<'all' | 'gainers' | 'losers'>('all');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getTickers();
        if (active) setTickers(data);
      } catch {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const filtered = useMemo(() => {
    const usdt = tickers.filter(t => t.symbol.endsWith('USDT') && t.lastPrice > 0 && t.quoteVolume > 50000);
    let result: Ticker[];
    if (filter === 'gainers') result = usdt.filter(t => t.priceChangePercent > 0).sort((a, b) => b.priceChangePercent - a.priceChangePercent);
    else if (filter === 'losers') result = usdt.filter(t => t.priceChangePercent < 0).sort((a, b) => a.priceChangePercent - b.priceChangePercent);
    else result = usdt.sort((a, b) => b.quoteVolume - a.quoteVolume);
    return result.slice(0, 50);
  }, [tickers, filter]);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-primary">
        {(['all', 'gainers', 'losers'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 text-[10px] font-medium rounded-full transition-all ${
              filter === f ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted'
            }`}>
            {f === 'all' ? 'All' : f === 'gainers' ? 'Gainers' : 'Losers'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {filtered.map((t, i) => {
          const isUp = t.priceChangePercent >= 0;
          const selected = t.symbol === symbol;
          return (
            <div key={t.symbol} onClick={() => setSymbol(t.symbol)}
              className={`flex items-center px-4 py-2.5 active:bg-bg-tertiary/50 transition-colors cursor-pointer border-b border-border-primary/30 ${
                selected ? 'bg-accent-blue/5 border-l-2 border-l-accent-blue' : ''
              }`}>
              <span className="w-5 text-[10px] text-text-muted font-mono shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${selected ? 'text-accent-blue' : 'text-text-primary'}`}>{getBaseAsset(t.symbol)}</span>
                  <span className="text-[9px] text-text-muted">/USDT</span>
                  <button onClick={e => { e.stopPropagation(); toggleFavorite(t.symbol); }}
                    className={`text-xs ${isFavorite(t.symbol) ? 'text-accent-yellow' : 'text-text-muted'}`}>
                    {isFavorite(t.symbol) ? '★' : '☆'}
                  </button>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono font-medium text-text-primary">${formatPrice(t.lastPrice)}</div>
                <div className={`text-xs font-mono font-semibold ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                  {formatPercent(t.priceChangePercent)}
                </div>
              </div>
              <div className="text-right ml-3 min-w-[60px]">
                <div className="text-[10px] text-text-muted font-mono">{formatVolume(t.volume)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileChartTab() {
  return (
    <div className="h-full w-full bg-bg-primary">
      <ChartPanel />
    </div>
  );
}

function MobileOrderBookTab({ symbol }: { symbol: string }) {
  return (
    <div className="h-full w-full bg-bg-primary p-3">
      <OrderBook symbol={symbol} />
    </div>
  );
}

function MobileSignalsTab() {
  return (
    <div className="h-full w-full bg-bg-primary">
      <SignalPanel />
    </div>
  );
}

export function MobileTerminal() {
  const { symbol } = useAppStore();
  const [tab, setTab] = useState<MobileTab>('chart');

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <MobileHeader symbol={symbol} />
      <div className="flex-1 overflow-hidden">
        {tab === 'market' && <MarketList />}
        {tab === 'chart' && <MobileChartTab />}
        {tab === 'orderbook' && <MobileOrderBookTab symbol={symbol} />}
        {tab === 'signals' && <MobileSignalsTab />}
      </div>
      <MobileBottomNav tab={tab} onTabChange={setTab} />
    </div>
  );
}

function MobileBottomNav({ tab, onTabChange }: { tab: MobileTab; onTabChange: (t: MobileTab) => void }) {
  const tabs: { id: MobileTab; label: string; icon: string }[] = [
    { id: 'market', label: 'Market', icon: '📊' },
    { id: 'chart', label: 'Chart', icon: '📈' },
    { id: 'orderbook', label: 'Order Book', icon: '📋' },
    { id: 'signals', label: 'Signals', icon: '🤖' },
  ];
  return (
    <nav className="flex items-center border-t border-border-primary bg-bg-secondary/95 backdrop-blur-xl safe-area-bottom">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTabChange(t.id)}
          className={`flex-1 flex flex-col items-center py-2.5 text-[10px] font-medium transition-all ${
            tab === t.id ? 'text-accent-green' : 'text-text-muted'
          }`}>
          <span className="text-lg mb-0.5">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
