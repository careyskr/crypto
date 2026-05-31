import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTicker as getBinanceTicker, getTickers } from '../utils/binanceApi';
import { formatPrice, formatPercent, formatVolume, formatSymbol, getBaseAsset } from '../utils/format';
import { ChartPanel } from './ChartPanel';
import { OrderBook } from './OrderBook';
import { SignalPanel } from './SignalPanel';
import type { Ticker } from '../types';

type MobileTab = 'market' | 'chart' | 'orderbook';

function MobileHeader({ symbol, onMenu }: { symbol: string; onMenu: () => void }) {
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
    <div className="px-3 pt-2.5 pb-2 bg-bg-primary border-b border-border-primary">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <button onClick={onMenu} className="p-1.5 -ml-1 rounded-lg active:bg-bg-tertiary/50 touch-target">
            <svg className="w-5 h-5 text-text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <button onClick={() => setSearchOpen(true)} className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-text-primary">{formatSymbol(symbol)}</span>
            <svg className="w-3.5 h-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold font-mono leading-tight ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
            ${formatPrice(ticker?.lastPrice ?? 0)}
          </div>
          <div className={`text-xs font-semibold font-mono ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
            {isUp ? '▲' : '▼'} {formatPercent(ticker?.priceChangePercent ?? 0)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted font-mono mt-1">
        <span className="text-text-secondary">H <span className="text-text-primary">${formatPrice(ticker?.highPrice ?? 0)}</span></span>
        <span className="text-text-secondary">L <span className="text-text-primary">${formatPrice(ticker?.lowPrice ?? 0)}</span></span>
        <span className="text-text-secondary">Vol <span className="text-text-primary">{formatVolume(ticker?.quoteVolume ?? 0)}</span></span>
      </div>
    </div>
  );
}

/* ─── Slide Drawer with finger-following ─── */
const DRAWER_WIDTH = 280;
const EDGE_HIT_WIDTH = 20;

function SlideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, setPage, toggleFavorite, isFavorite, favorites, setSymbol, symbol } = useAppStore();
  const drawerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragX = useRef(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const animFrame = useRef<number>(0);
  const [translateX, setTranslateX] = useState(open ? 0 : -DRAWER_WIDTH);
  const [isOpen, setIsOpen] = useState(open);
  const [transition, setTransition] = useState('transform 0.3s ease-out');

  useEffect(() => {
    setIsOpen(open);
    setTransition('transform 0.3s ease-out');
    setTranslateX(open ? 0 : -DRAWER_WIDTH);
  }, [open]);

  const pages: { id: typeof page; label: string; icon: string }[] = [
    { id: 'terminal', label: 'Terminal', icon: '◈' },
    { id: 'paper', label: 'Paper Trading', icon: '📊' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'patterns', label: 'Patterns', icon: '◇' },
    { id: 'whale', label: 'Whale Tracker', icon: '🐋' },
    { id: 'risk', label: 'Risk Manager', icon: '⚙' },
  ];

  const handleTouchStart = (clientX: number) => {
    if (!open) return;
    startX.current = clientX;
    dragX.current = translateX;
    dragging.current = true;
    setTransition('none');
  };

  const handleTouchMove = (clientX: number) => {
    if (!dragging.current) return;
    const dx = clientX - startX.current;
    let newX = dragX.current + dx;
    if (newX > 0) newX = newX * 0.3;
    if (newX < -DRAWER_WIDTH) newX = -DRAWER_WIDTH + (newX + DRAWER_WIDTH) * 0.3;
    cancelAnimationFrame(animFrame.current);
    animFrame.current = requestAnimationFrame(() => setTranslateX(newX));
  };

  const handleTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setTransition('transform 0.3s ease-out');
    if (translateX > -DRAWER_WIDTH * 0.35) {
      setTranslateX(0);
      setIsOpen(true);
    } else {
      setTranslateX(-DRAWER_WIDTH);
      setIsOpen(false);
      if (open) setTimeout(onClose, 300);
    }
  };

  const closeDrawer = () => {
    setTransition('transform 0.3s ease-out');
    setTranslateX(-DRAWER_WIDTH);
    setIsOpen(false);
    setTimeout(onClose, 300);
  };

  return (
    <>
      <div ref={overlayRef}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${open && isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeDrawer} />
      <div ref={drawerRef}
        onTouchStart={e => handleTouchStart(e.touches[0].clientX)}
        onTouchMove={e => handleTouchMove(e.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
        className="fixed top-0 left-0 bottom-0 z-50 bg-bg-secondary shadow-2xl"
        style={{ width: DRAWER_WIDTH, transform: `translateX(${translateX}px)`, transition }}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 h-12 border-b border-border-primary">
            <span className="text-sm font-bold text-text-primary">CryptoSignal Pro</span>
            <button onClick={closeDrawer} className="p-1.5 rounded-lg active:bg-bg-tertiary/50">
              <svg className="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {pages.map(p => (
              <button key={p.id} onClick={() => { setPage(p.id); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                  page === p.id ? 'text-accent-green bg-accent-green/5 border-r-2 border-r-accent-green' : 'text-text-secondary'
                }`}>
                <span className="text-base">{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
            <div className="mt-4 px-4 py-2">
              <div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider mb-2">Favorites</div>
              {favorites.map(fav => (
                <button key={fav} onClick={() => { setSymbol(fav); onClose(); }}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg active:bg-bg-tertiary/30 text-sm">
                  <span className="text-text-primary">{getBaseAsset(fav)}<span className="text-text-muted">/USDT</span></span>
                  <button onClick={e => { e.stopPropagation(); toggleFavorite(fav); }}
                    className={`text-sm ${isFavorite(fav) ? 'text-accent-yellow' : 'text-text-muted'}`}>
                    {isFavorite(fav) ? '★' : '☆'}
                  </button>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Bottom Sheet with finger-following ─── */
function BottomSheet({ open, onClose, children, height = '65vh' }: { open: boolean; onClose: () => void; children: React.ReactNode; height?: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const dragging = useRef(false);
  const animFrame = useRef<number>(0);
  const [translateY, setTranslateY] = useState(0);
  const [transition, setTransition] = useState('transform 0.3s ease-out');

  useEffect(() => {
    if (open) {
      setTransition('transform 0.3s ease-out');
      setTranslateY(0);
      document.body.style.overflow = 'hidden';
    } else {
      setTransition('transform 0.3s ease-out');
      setTranslateY(2000);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleTouchStart = (clientY: number) => {
    startY.current = clientY;
    dragging.current = true;
    setTransition('none');
  };

  const handleTouchMove = (clientY: number) => {
    if (!dragging.current) return;
    const dy = clientY - startY.current;
    const newY = dy < 0 ? dy * 0.3 : dy;
    cancelAnimationFrame(animFrame.current);
    animFrame.current = requestAnimationFrame(() => setTranslateY(newY));
  };

  const handleTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setTransition('transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)');
    const el = sheetRef.current;
    if (el) {
      const h = el.getBoundingClientRect().height;
      if (translateY > h * 0.3) {
        setTranslateY(h);
        setTimeout(onClose, 300);
      } else {
        setTranslateY(0);
      }
    } else {
      setTranslateY(0);
    }
  };

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose} />
      <div ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary rounded-t-2xl shadow-2xl"
        style={{ height, transform: `translateY(${translateY}px)`, transition }}>
        <div className="flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
          onTouchStart={e => handleTouchStart(e.touches[0].clientY)}
          onTouchMove={e => handleTouchMove(e.touches[0].clientY)}
          onTouchEnd={handleTouchEnd}>
          <div className="w-10 h-1 rounded-full bg-text-muted/30" />
        </div>
        <div className="h-[calc(100%-20px)] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </>
  );
}

/* ─── Left-edge swipe handler ─── */
function EdgeSwipeHandler({ onSwipe }: { onSwipe: () => void }) {
  const startX = useRef(0);
  const dragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches[0].clientX < EDGE_HIT_WIDTH) {
      startX.current = e.touches[0].clientX;
      dragging.current = true;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx > 50) { onSwipe(); dragging.current = false; }
  };
  const onTouchEnd = () => { dragging.current = false; };

  return <div className="fixed left-0 top-0 bottom-0 z-30" style={{ width: EDGE_HIT_WIDTH }}
    onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />;
}

function MarketList() {
  const { setSymbol, symbol, toggleFavorite, isFavorite } = useAppStore();
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
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-primary overflow-x-auto scrollbar-none shrink-0">
        {(['all', 'gainers', 'losers'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap touch-target ${
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
              className={`flex items-center px-3 py-3 active:bg-bg-tertiary/50 transition-colors cursor-pointer border-b border-border-primary/30 ${
                selected ? 'bg-accent-blue/5 border-l-2 border-l-accent-blue' : ''
              }`}>
              <span className="w-6 text-[10px] text-text-muted font-mono shrink-0 text-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${selected ? 'text-accent-blue' : 'text-text-primary'}`}>{getBaseAsset(t.symbol)}</span>
                  <span className="text-[9px] text-text-muted hidden xs:inline">/USDT</span>
                  <button onClick={e => { e.stopPropagation(); toggleFavorite(t.symbol); }}
                    className={`text-xs p-0.5 ${isFavorite(t.symbol) ? 'text-accent-yellow' : 'text-text-muted'}`}>
                    {isFavorite(t.symbol) ? '★' : '☆'}
                  </button>
                </div>
              </div>
              <div className="text-right mr-2">
                <div className="text-sm font-mono font-medium text-text-primary">${formatPrice(t.lastPrice)}</div>
                <div className={`text-xs font-mono font-semibold ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                  {formatPercent(t.priceChangePercent)}
                </div>
              </div>
              <div className="text-right min-w-[60px] hidden sm:block">
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
    <div className="h-[55vh] min-h-[320px] w-full bg-bg-primary flex flex-col overflow-hidden">
      <ChartPanel />
    </div>
  );
}

function MobileOrderBookTab({ symbol }: { symbol: string }) {
  return (
    <div className="h-full w-full bg-bg-primary px-2 py-1">
      <OrderBook symbol={symbol} />
    </div>
  );
}

export function MobileTerminal() {
  const { symbol } = useAppStore();
  const [tab, setTab] = useState<MobileTab>('chart');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-x-hidden">
      {!drawerOpen && <EdgeSwipeHandler onSwipe={() => setDrawerOpen(true)} />}
      <MobileHeader symbol={symbol} onMenu={() => setDrawerOpen(true)} />
      <div className="flex-1 overflow-hidden relative">
        {tab === 'market' && <MarketList />}
        {tab === 'chart' && <MobileChartTab />}
        {tab === 'orderbook' && <MobileOrderBookTab symbol={symbol} />}
      </div>
      <MobileBottomNav tab={tab} onTabChange={setTab} onSignals={() => setSignalsOpen(true)} />
      <SlideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomSheet open={signalsOpen} onClose={() => setSignalsOpen(false)} height="70vh">
        <div className="px-3 pb-4">
          <div className="text-sm font-bold text-text-primary mb-3 px-1">AI Signals</div>
          <SignalPanel />
        </div>
      </BottomSheet>
    </div>
  );
}

function MobileBottomNav({ tab, onTabChange, onSignals }: { tab: MobileTab; onTabChange: (t: MobileTab) => void; onSignals: () => void }) {
  const tabs: { id: MobileTab; label: string; icon: string }[] = [
    { id: 'market', label: 'Market', icon: '📊' },
    { id: 'chart', label: 'Chart', icon: '📈' },
    { id: 'orderbook', label: 'Order Book', icon: '📋' },
  ];
  return (
    <nav className="flex items-center border-t border-border-primary bg-bg-secondary/95 backdrop-blur-xl safe-area-bottom">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTabChange(t.id)}
          className={`flex-1 flex flex-col items-center py-2.5 text-[10px] font-medium transition-all touch-target ${
            tab === t.id ? 'text-accent-green' : 'text-text-muted'
          }`}>
          <span className="text-lg mb-0.5">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
      <button onClick={onSignals}
        className="flex-1 flex flex-col items-center py-2.5 text-[10px] font-medium text-text-muted transition-all touch-target">
        <span className="text-lg mb-0.5">🤖</span>
        <span>Signals</span>
      </button>
    </nav>
  );
}
