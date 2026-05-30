import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, Time, ColorType } from 'lightweight-charts';
import { useAppStore } from '../stores/useAppStore';
import { formatPrice, formatPercent, formatVolume, formatSymbol, getBaseAsset } from '../utils/format';
import { usePaperPositions, LivePosition, PendingOrder } from '../hooks/usePaperPositions';
import { getTicker, getKlines, searchSymbols } from '../utils/binanceApi';
import { MarketMovers } from './MarketMovers';

const API = '/api/paper';
const LEVERAGE_PRESETS = [1, 2, 3, 5, 10, 20, 25, 50];

type OrderType = 'market' | 'limit' | 'stop';
type Tab = 'chart' | 'positions' | 'orders' | 'history' | 'movers';

export function PaperTrading() {
  const { symbol } = useAppStore();
  const { positions, pendingOrders, refreshPositions, refreshPendingOrders, closeTrade, modifyTrade, partialClose, cancelOrder, modifyPendingOrder } = usePaperPositions();
  const [stats, setStats] = useState<any>(null);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('positions');
  const [loading, setLoading] = useState(true);
  const [modifyTradeId, setModifyTradeId] = useState<number | null>(null);
  const [modifyOrderId, setModifyOrderId] = useState<number | null>(null);
  const [confirmTrade, setConfirmTrade] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [s, ct] = await Promise.all([
        fetch(`${API}/stats`).then(r => r.json()),
        fetch(`${API}/trades/closed?limit=30`).then(r => r.json()),
      ]);
      setStats(s);
      setClosedTrades(ct);
    } catch {}
    setLoading(false);
    refreshPositions();
    refreshPendingOrders();
  }, [refreshPositions, refreshPendingOrders]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
        <span className="text-[10px] text-text-muted">Loading paper trading...</span>
      </div>
    </div>
  );

  const acc = stats?.account;
  const balance = acc ? parseFloat(acc.balance) : 0;
  const unrealizedPnl = positions.reduce((sum: number, p: LivePosition) => sum + (p.unrealized_pnl || 0), 0);
  const equity = +(balance + unrealizedPnl).toFixed(2);
  const usedMargin = positions.reduce((sum: number, p: LivePosition) => sum + (p.margin || 0), 0);
  const freeBalance = Math.max(0, +(balance - usedMargin).toFixed(2));

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Order Entry */}
      <div className="w-[340px] shrink-0 border-r border-border-primary overflow-y-auto">
        <div className="p-3">
          <OrderEntry symbol={symbol} onTrade={load} stats={stats} positions={positions} setConfirmTrade={setConfirmTrade} />
        </div>
      </div>

      {/* Center: Positions / Orders / History */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border-primary bg-bg-secondary/50 shrink-0">
          {(['chart', 'positions', 'orders', 'history', 'movers'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                tab === t ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
              }`}>
              {t === 'chart' ? 'Chart' : t === 'positions' ? `Positions (${positions.length})` : t === 'orders' ? `Orders (${pendingOrders.length})` : t === 'movers' ? 'Movers' : 'History'}
            </button>
          ))}
          <div className="flex-1" />
          {tab === 'positions' && positions.length > 0 && (
            <span className="text-[10px] text-text-muted">
              Equity: <span className="text-text-primary font-mono font-medium">${equity.toFixed(2)}</span>
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {tab === 'chart' && <PaperChart symbol={symbol} />}

          {tab === 'positions' && (
            positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <div className="text-2xl mb-2 opacity-30">📭</div>
                <div className="text-xs">No open positions</div>
                <div className="text-[10px] mt-1">Place a trade to get started</div>
              </div>
            ) : (
              <div className="space-y-2">
                {positions.map((t: LivePosition) => (
                  <PositionCard
                    key={t.id}
                    trade={t}
                    onClose={() => closeTrade(t.id, t.current_price)}
                    onModify={() => setModifyTradeId(t.id)}
                    onPartialClose={(pct: number) => {
                      partialClose(t.id, pct);
                    }}
                  />
                ))}
              </div>
            )
          )}

          {tab === 'orders' && (
            pendingOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <div className="text-2xl mb-2 opacity-30">📋</div>
                <div className="text-xs">No open orders</div>
                <div className="text-[10px] mt-1">Place a limit or stop order to see it here</div>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingOrders.map((o: PendingOrder) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onCancel={() => cancelOrder(o.id)}
                    onModify={() => setModifyOrderId(o.id)}
                  />
                ))}
              </div>
            )
          )}

          {tab === 'history' && <TradeHistory trades={closedTrades} />}
          {tab === 'movers' && <MarketMovers />}
        </div>
      </div>

      {/* Right: Account Info + Mini Order Book */}
      <div className="w-[260px] shrink-0 border-l border-border-primary overflow-y-auto">
        <div className="p-3 space-y-3">
          {acc && <AccountSummary acc={acc} equity={equity} usedMargin={usedMargin} freeBalance={freeBalance} stats={stats} positions={positions} />}
          <MiniOrderBook symbol={symbol} />
        </div>
      </div>

      {/* Modify Modal */}
      {modifyTradeId !== null && (
        <ModifyModal
          tradeId={modifyTradeId}
          positions={positions}
          onSave={async (updates) => {
            await modifyTrade(modifyTradeId, updates);
            setModifyTradeId(null);
            load();
          }}
          onMoveSlToBreakeven={async () => {
            await modifyTrade(modifyTradeId, { slToBreakeven: true });
            setModifyTradeId(null);
            load();
          }}
          onClose={() => setModifyTradeId(null)}
        />
      )}

      {/* Order Modify Modal */}
      {modifyOrderId !== null && (
        <OrderModifyModal
          orderId={modifyOrderId}
          pendingOrders={pendingOrders}
          onSave={async (updates) => {
            await modifyPendingOrder(modifyOrderId, updates);
            setModifyOrderId(null);
            load();
          }}
          onClose={() => setModifyOrderId(null)}
        />
      )}

      {/* Confirmation Modal */}
      {confirmTrade && (
        <ConfirmModal
          trade={confirmTrade}
          onConfirm={() => {
            setConfirmTrade(null);
            load();
          }}
          onCancel={() => setConfirmTrade(null)}
        />
      )}
    </div>
  );
}

/* ─── ORDER ENTRY ─── */
const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'INJUSDT', 'SUIUSDT', 'OPUSDT', 'ARBUSDT', 'ATOMUSDT', 'NEARUSDT', 'APTUSDT', 'MATICUSDT', 'FILUSDT', 'ICPUSDT', 'FETUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT'];

function OrderEntry({ symbol, onTrade, stats, positions, setConfirmTrade }: any) {
  const { setSymbol, favorites } = useAppStore();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [price, setPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [qty, setQty] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [error, setError] = useState('');
  const [usePct, setUsePct] = useState(100);
  const [useUSDT, setUseUSDT] = useState(false);
  const [usdtAmount, setUsdtAmount] = useState('');

  // Auto-fill current market price
  useEffect(() => {
    let cancelled = false;
    getTicker(symbol).then(d => {
      if (!cancelled && d?.lastPrice) setPrice(d.lastPrice.toString());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // When USDT amount changes, calculate quantity
  useEffect(() => {
    if (useUSDT && usdtAmount && price) {
      const p = parseFloat(price);
      const u = parseFloat(usdtAmount);
      if (p > 0 && u > 0) {
        setQty((u / p).toFixed(8));
      }
    }
  }, [usdtAmount, price, useUSDT]);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [pairSearch, setPairSearch] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const pairRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<any>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pairRef.current && !pairRef.current.contains(e.target as Node)) {
        setShowPairSelector(false);
      }
    }
    if (showPairSelector) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPairSelector]);

  useEffect(() => {
    if (!pairSearch) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await searchSymbols(pairSearch);
        setSearchResults(data.map((s: any) => s.symbol || s));
      } catch {}
      setSearchLoading(false);
    }, 200);
    return () => clearTimeout(searchTimer.current);
  }, [pairSearch]);

  const displayPairs = useMemo(() => {
    if (pairSearch) return searchResults;
    const seen = new Set<string>();
    return [...favorites, ...POPULAR_SYMBOLS].filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [pairSearch, searchResults, favorites]);

  const acc = stats?.account;
  const baseAsset = getBaseAsset(symbol);
  const isBuy = side === 'buy';
  const usedMargin = positions.reduce((sum: number, p: LivePosition) => sum + (p.margin || 0), 0);

  const estimatedMargin = useMemo(() => {
    const p = parseFloat(price) || 0;
    const q = parseFloat(qty) || 0;
    return (p * q) / leverage;
  }, [price, qty, leverage]);

  useEffect(() => {
    if (usePct && acc) {
      const bal = acc.balance - usedMargin;
      const p = parseFloat(price) || 0;
      if (p > 0) {
        const maxQty = (bal * leverage * (usePct / 100)) / p;
        setQty(maxQty.toFixed(6));
      }
    }
  }, [price, usePct, leverage, acc, usedMargin]);

  const submit = async () => {
    setError('');

    if (orderType === 'market') {
      try {
        const ticker = await getTicker(symbol);
        const livePrice = ticker?.lastPrice;
        if (!livePrice || livePrice <= 0) { setError('Could not fetch live price'); return; }

        const q = parseFloat(qty);
        if (!q || q <= 0) { setError('Enter a valid quantity'); return; }

        const res = await fetch('/api/paper/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            side: isBuy ? 'long' : 'short',
            entryPrice: livePrice,
            quantity: q,
            leverage,
            stopLoss: sl ? parseFloat(sl) : null,
            tp1: tp ? parseFloat(tp) : null,
          }),
        });
        if (!res.ok) { const e = await res.json(); setError(e.error); return; }
        onTrade();
        setPrice(livePrice.toString()); setQty(''); setSl(''); setTp(''); setUsePct(100);
      } catch (err: any) { setError(err.message); }
    } else {
      const tradeData = {
        symbol,
        side: isBuy ? 'long' : 'short',
        entryPrice: parseFloat(orderType === 'stop' ? stopPrice : price),
        quantity: parseFloat(qty),
        leverage,
        stopLoss: sl ? parseFloat(sl) : null,
        tp1: tp ? parseFloat(tp) : null,
      };
      setConfirmTrade({ ...tradeData, orderType });
    }
  };

  const isLong = side === 'buy';

  return (
    <div className="space-y-3">
      {/* Pair Selector */}
      <div ref={pairRef} className="relative">
        <button onClick={() => setShowPairSelector(!showPairSelector)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-bg-primary border border-border-primary hover:border-accent-green/30 transition-all">
          <span className="text-sm font-bold font-mono">{formatSymbol(symbol)}</span>
          <svg className={`w-3.5 h-3.5 text-text-muted transition-transform ${showPairSelector ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showPairSelector && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-bg-secondary border border-border-primary shadow-2xl z-50 overflow-hidden">
            <div className="p-2">
              <input
                autoFocus
                type="text"
                value={pairSearch}
                onChange={e => setPairSearch(e.target.value)}
                placeholder="Search pair..."
                className="w-full bg-bg-primary border border-border-primary rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted font-mono focus:outline-none focus:border-accent-green/30"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto divide-y divide-border-primary/50">
              {searchLoading && <div className="px-3 py-3 text-[10px] text-text-muted text-center">Searching...</div>}
              {!searchLoading && displayPairs.map(p => (
                <button key={p} onClick={() => { setSymbol(p); setShowPairSelector(false); setPairSearch(''); }}
                  className={`flex items-center justify-between w-full px-3 py-2 text-xs hover:bg-bg-tertiary/50 transition-colors ${p === symbol ? 'bg-accent-blue/5 text-accent-blue' : 'text-text-primary'}`}>
                  <span className="font-mono font-medium">{formatSymbol(p)}</span>
                  {favorites.includes(p) && <span className="text-accent-yellow text-[10px]">★</span>}
                </button>
              ))}
              {!searchLoading && displayPairs.length === 0 && (
                <div className="px-3 py-4 text-[10px] text-text-muted text-center">No pairs found</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Buy/Sell Toggle */}
      <div className="flex gap-1.5">
        <button onClick={() => setSide('buy')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            isBuy ? 'bg-accent-green/20 text-accent-green shadow-[0_0_12px_rgba(0,255,136,0.15)]' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
          }`}>
          <span className="text-sm mr-1">▲</span> BUY / LONG
        </button>
        <button onClick={() => setSide('sell')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            !isBuy ? 'bg-accent-red/20 text-accent-red shadow-[0_0_12px_rgba(255,51,102,0.15)]' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
          }`}>
          <span className="text-sm mr-1">▼</span> SELL / SHORT
        </button>
      </div>

      {/* Order Type */}
      <div className="flex gap-1 bg-bg-primary rounded-lg p-0.5">
        {(['market', 'limit', 'stop'] as const).map(ot => (
          <button key={ot} onClick={() => setOrderType(ot)}
            className={`flex-1 py-1 text-[10px] font-medium rounded-md transition-all ${
              orderType === ot ? 'bg-bg-secondary text-text-primary' : 'text-text-muted hover:text-text-secondary'
            }`}>
            {ot === 'market' ? 'Market' : ot === 'limit' ? 'Limit' : 'Stop'}
          </button>
        ))}
      </div>

      {/* Price Input (limit/stop) */}
      {orderType !== 'market' && (
        <div>
          <label className="text-[10px] text-text-muted mb-1 block">
            {orderType === 'limit' ? 'Limit Price' : 'Stop Price'}
          </label>
          <input type="number" value={orderType === 'limit' ? price : stopPrice}
            onChange={e => orderType === 'limit' ? setPrice(e.target.value) : setStopPrice(e.target.value)}
            placeholder="0.00" step="any"
            className="w-full bg-bg-primary border border-border-primary rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
        </div>
      )}

      {/* Amount */}
      {orderType === 'market' && (
        <div>
          <label className="text-[10px] text-text-muted mb-1 block">Market Price (live, read-only)</label>
          <input type="number" value={price} readOnly
            className="w-full bg-bg-primary/50 border border-border-primary rounded-lg px-3 py-2 text-xs text-text-primary font-mono opacity-70 cursor-not-allowed" />
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="text-[10px] text-text-muted">
            {useUSDT ? 'Amount (USDT)' : `Amount (${baseAsset})`}
          </label>
          <button onClick={() => { setUseUSDT(!useUSDT); setQty(''); setUsdtAmount(''); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted hover:text-text-secondary transition-all font-mono">
            {useUSDT ? baseAsset : 'USDT'}
          </button>
        </div>
        {useUSDT ? (
          <input type="number" value={usdtAmount} onChange={e => setUsdtAmount(e.target.value)}
            placeholder="0.00" step="any"
            className="w-full bg-bg-primary border border-border-primary rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
        ) : (
          <input type="number" value={qty} onChange={e => { setQty(e.target.value); setUsdtAmount(''); }}
            placeholder="0.00" step="any"
            className="w-full bg-bg-primary border border-border-primary rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
        )}
        <div className="flex gap-1 mt-1.5">
          {[25, 50, 75, 100].map(p => (
            <button key={p} onClick={() => setUsePct(p)}
              className={`flex-1 text-[9px] py-1 rounded font-medium transition-all ${
                usePct === p ? 'bg-accent-blue/15 text-accent-blue' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
              }`}>
              {p}%
            </button>
          ))}
        </div>
      </div>

      {/* Leverage */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-text-muted">Leverage</label>
          <span className="text-[11px] font-mono font-bold text-accent-yellow">{leverage}x</span>
        </div>
        <div className="flex gap-1 mb-1.5 flex-wrap">
          {LEVERAGE_PRESETS.map(l => (
            <button key={l} onClick={() => setLeverage(l)}
              className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all ${
                leverage === l
                  ? 'bg-accent-yellow/15 text-accent-yellow'
                  : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
              }`}>
              {l}x
            </button>
          ))}
        </div>
        <input type="range" min={1} max={50} value={leverage}
          onChange={e => setLeverage(parseInt(e.target.value))}
          className="w-full accent-accent-yellow h-1" />
      </div>

      {/* TP/SL */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-text-muted mb-1 block">Take Profit</label>
          <input type="number" value={tp} onChange={e => setTp(e.target.value)}
            placeholder="--" step="any"
            className="w-full bg-bg-primary border border-border-primary rounded-lg px-2.5 py-1.5 text-[11px] text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted mb-1 block">Stop Loss</label>
          <input type="number" value={sl} onChange={e => setSl(e.target.value)}
            placeholder="--" step="any"
            className="w-full bg-bg-primary border border-border-primary rounded-lg px-2.5 py-1.5 text-[11px] text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
        </div>
      </div>

      {/* Estimated Info */}
      {price && qty && (
        <div className="text-[10px] space-y-0.5 text-text-muted bg-bg-primary rounded-lg p-2">
          <div className="flex justify-between">
            <span>Entry value</span>
            <span className="font-mono text-text-primary">${(parseFloat(price) * parseFloat(qty)).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Margin</span>
            <span className="font-mono text-text-primary">${estimatedMargin.toFixed(2)}</span>
          </div>
          {acc && (
            <div className="flex justify-between">
              <span>Available</span>
              <span className="font-mono text-text-primary">${Math.max(0, acc.balance - usedMargin).toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="text-[11px] text-accent-red bg-accent-red/10 rounded-lg px-3 py-2">{error}</div>}

      {/* Submit Button */}
      <button onClick={submit}
        className={`w-full py-3 rounded-lg text-xs font-bold transition-all ${
          isBuy
            ? 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30 border border-accent-green/20'
            : 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30 border border-accent-red/20'
        }`}>
        {isBuy ? '▲ Buy / Long' : '▼ Sell / Short'} {formatSymbol(symbol)}
      </button>
    </div>
  );
}

/* ─── PAPER CHART ─── */
function PaperChart({ symbol }: { symbol: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [srEnabled, setSrEnabled] = useState(false);
  const klinesRef = useRef<any[]>([]);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7a7a9a' },
      grid: { vertLines: { color: '#1e1e2e' }, horzLines: { color: '#1e1e2e' } },
      crosshair: { vertLine: { color: '#505070' }, horzLine: { color: '#505070' } },
      timeScale: { borderColor: '#2a2a3e' },
      rightPriceScale: { borderColor: '#2a2a3e' },
    });
    chartApiRef.current = chart;
    const series = chart.addCandlestickSeries({
      upColor: '#00ff88', downColor: '#ff3366', borderUpColor: '#00ff88', borderDownColor: '#ff3366',
      wickUpColor: '#00ff88', wickDownColor: '#ff3366',
    });
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  const clearSR = useCallback(() => {
    priceLinesRef.current.forEach(pl => seriesRef.current?.removePriceLine(pl));
    priceLinesRef.current = [];
  }, []);

  const detectSRZones = useCallback((data: any[], currentPrice?: number) => {
    const result = { resistances: [] as { price: number; count: number; touches: number; score: number }[], supports: [] as { price: number; count: number; touches: number; score: number }[] };
    if (data.length < 20) return result;
    const len = data.length;
    const current = currentPrice || data[len - 1]?.close || 0;
    if (!current) return result;

    const levels: { price: number }[] = [];
    for (let i = 2; i < len - 2; i++) {
      const h = data[i].high;
      const l = data[i].low;
      if (h >= data[i-2].high && h >= data[i-1].high && h >= data[i+1].high && h >= data[i+2].high) levels.push({ price: h });
      if (l <= data[i-2].low && l <= data[i-1].low && l <= data[i+1].low && l <= data[i+2].low) levels.push({ price: l });
    }

    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const zones: { price: number; count: number }[] = [];
    for (const l of sorted) {
      const match = zones.find(z => Math.abs(l.price - z.price) / z.price * 100 < 0.2);
      if (match) { match.price = (match.price * match.count + l.price) / (match.count + 1); match.count++; }
      else zones.push({ price: l.price, count: 1 });
    }

    const scored = zones.map(z => {
      let touches = 0;
      for (const c of data) {
        if (Math.abs(c.high - z.price) / z.price * 100 < 0.2 || Math.abs(c.low - z.price) / z.price * 100 < 0.2) touches++;
      }
      const distPct = Math.abs(z.price - current) / current;
      const score = touches * 2 + z.count * 2 - distPct * 3;
      return { ...z, touches, score };
    });

    const above = scored.filter(z => z.price > current);
    const below = scored.filter(z => z.price < current);

    const pick = (items: typeof scored) => {
      const byScore = [...items].sort((a, b) => b.score - a.score).slice(0, 8);
      return byScore.sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current)).slice(0, 2);
    };

    result.resistances = pick(above).sort((a, b) => a.price - b.price);
    result.supports = pick(below).sort((a, b) => b.price - a.price);

    return result;
  }, []);

  const drawSR = useCallback((data: any[]) => {
    if (!seriesRef.current) return;
    clearSR();
    const currentPrice = data[data.length - 1]?.close || 0;
    const { resistances, supports } = detectSRZones(data, currentPrice);

    const draw = (items: typeof resistances, prefix: string, color: string) => {
      items.forEach((z, i) => {
        const isStrong = z.count >= 3 || z.touches >= 5 || (items.length > 1 && z.score > (items[1]?.score || 0) * 1.5);
        const pl = seriesRef.current!.createPriceLine({
          price: z.price, color, lineWidth: 4, lineStyle: 0,
          axisLabelVisible: true, title: `${prefix}${i + 1}${isStrong ? ' Strong' : ''}`,
        });
        priceLinesRef.current.push(pl);
      });
    };

    draw(resistances, 'R', 'rgba(255, 51, 102, 0.6)');
    draw(supports, 'S', 'rgba(0, 255, 136, 0.6)');
  }, [clearSR, detectSRZones]);

  const toggleSR = useCallback(() => {
    if (srEnabled) {
      clearSR();
      setSrEnabled(false);
    } else {
      setSrEnabled(true);
      if (klinesRef.current.length > 0) {
        drawSR(klinesRef.current);
      }
    }
  }, [srEnabled, clearSR, drawSR]);

  useEffect(() => {
    let active = true;
    const loadKlines = async () => {
      try {
        const raw = await getKlines(symbol, timeframe, 200);
        if (!active) return;
        const data = raw.map((k: any) => ({
          time: k.time as Time,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        }));
        klinesRef.current = data;
        seriesRef.current?.setData(data);
        chartApiRef.current?.timeScale().fitContent();
        if (srEnabled) drawSR(data);
      } catch {}
    };
    loadKlines();
    const id = window.setInterval(loadKlines, 15000);
    return () => { active = false; window.clearInterval(id); };
  }, [symbol, timeframe, srEnabled, drawSR]);

  const intervals = ['5m', '15m', '1h', '4h', '1d'];

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-1 pb-2">
        {intervals.map(iv => (
          <button key={iv} onClick={() => setTimeframe(iv)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
              timeframe === iv ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted hover:text-text-secondary bg-bg-tertiary'
            }`}>
            {iv}
          </button>
        ))}
        <div className="w-px h-4 bg-border-primary mx-1" />
        <button onClick={() => chartApiRef.current?.timeScale().fitContent()}
          className="px-2 py-0.5 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-all" title="Reset Zoom">
          ⟲
        </button>
        <button onClick={() => { const ts = chartApiRef.current?.timeScale(); if (!ts) return; const r = ts.getVisibleRange(); if (!r) return; const mid = (Number(r.from) + Number(r.to)) / 2; const span = Number(r.to) - Number(r.from); ts.setVisibleRange({ from: mid - span * 0.65, to: mid + span * 0.65 } as any); }}
          className="px-2 py-0.5 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-all" title="Zoom Out">
          −
        </button>
        <button onClick={() => { const ts = chartApiRef.current?.timeScale(); if (!ts) return; const r = ts.getVisibleRange(); if (!r) return; const mid = (Number(r.from) + Number(r.to)) / 2; const span = Number(r.to) - Number(r.from); ts.setVisibleRange({ from: mid - span * 1.35, to: mid + span * 1.35 } as any); }}
          className="px-2 py-0.5 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-all" title="Zoom In">
          +
        </button>
        <div className="w-px h-4 bg-border-primary mx-1" />
        <button onClick={toggleSR}
          className={`px-2.5 py-0.5 text-[10px] font-medium rounded transition-all ${
            srEnabled ? 'bg-accent-purple/20 text-accent-purple shadow-[0_0_8px_rgba(139,92,246,0.2)]' : 'text-text-muted hover:text-text-secondary bg-bg-tertiary'
          }`}>
          Auto S/R
        </button>
      </div>
      <div ref={chartRef} className="rounded-lg overflow-hidden" style={{ height: 400 }} />
    </div>
  );
}

/* ─── POSITION CARD ─── */
function PositionCard({ trade, onClose, onModify, onPartialClose }: {
  trade: LivePosition; onClose: () => void; onModify: () => void; onPartialClose: (pct: number) => void;
}) {
  const [showCloseSlider, setShowCloseSlider] = useState(false);
  const [closePct, setClosePct] = useState(100);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const isLong = trade.side === 'long';
  const pnl = trade.unrealized_pnl ?? 0;
  const pnlPct = trade.unrealized_pnl_percent ?? 0;
  const qty = Number(trade.quantity) || 0;
  const marginVal = trade.margin ?? 0;
  const pnlColor = pnl >= 0 ? 'text-accent-green' : 'text-accent-red';
  const bgGradient = isLong ? 'gradient-green' : 'gradient-red';

  const pnlBarWidth = Math.min(100, Math.abs(pnlPct));
  const isProfitable = pnl >= 0;

  const fetchAiAdvice = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/paper/ai-advice/${trade.id}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAiAdvice(data.advice);
      }
    } catch {}
    setAiLoading(false);
  };

  return (
    <div className={`glass p-3 ${bgGradient} relative overflow-hidden`}>
      {/* PnL Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-bg-primary">
        <div className={`h-full transition-all duration-700 ${isProfitable ? 'bg-accent-green' : 'bg-accent-red'}`}
          style={{ width: `${pnlBarWidth}%` }} />
      </div>

      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{trade.symbol.replace('USDT', '/USDT')}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
            isLong ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
          }`}>
            {isLong ? 'LONG' : 'SHORT'} {trade.leverage}x
          </span>
          {trade.trailing_stop && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue font-medium">
              TRAIL {trade.trailing_stop}%
            </span>
          )}
        </div>
        <div className="text-right">
          <div className={`text-sm font-mono font-bold ${pnlColor}`}>
            {isProfitable ? '+' : ''}${pnl.toFixed(2)}
           </div>
           <div className={`text-[10px] font-mono ${pnlColor}`}>
             ({isProfitable ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Prices Grid */}
      <div className="grid grid-cols-4 gap-3 mb-2.5 text-[10px]">
        <div>
          <div className="text-text-muted mb-0.5">Entry</div>
          <div className="font-mono text-text-primary font-semibold">{formatPrice(trade.entry_price)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Mark</div>
          <div className="font-mono text-text-primary font-semibold">{formatPrice(trade.current_price)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Liq.</div>
          <div className={`font-mono font-semibold ${trade.liquidation_price ? 'text-accent-red' : 'text-text-muted'}`}>
            {trade.liquidation_price ? formatPrice(trade.liquidation_price) : '—'}
          </div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Duration</div>
          <div className="font-mono text-text-primary">{trade.duration}</div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-4 gap-3 mb-2.5 text-[10px]">
        <div>
          <div className="text-text-muted mb-0.5">Size</div>
          <div className="font-mono text-text-primary">{qty.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Margin</div>
          <div className="font-mono text-text-primary">${marginVal.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">TP</div>
          <div className="font-mono text-text-primary">{trade.take_profit_1 ? formatPrice(trade.take_profit_1) : '—'}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">SL</div>
          <div className="font-mono text-accent-red">{trade.stop_loss ? formatPrice(trade.stop_loss) : '—'}</div>
        </div>
      </div>

      {/* TP Progress */}
      {trade.tp_progress > 0 && (
        <div className="flex items-center gap-2 mb-2.5 text-[10px]">
          <span className="text-text-muted shrink-0">TP Progress</span>
          <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${isLong ? 'bg-accent-green' : 'bg-accent-red'}`}
              style={{ width: `${Math.min(100, trade.tp_progress)}%` }} />
          </div>
          <span className="font-mono text-text-primary w-8 text-right">{trade.tp_progress.toFixed(0)}%</span>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono ${pnlColor}`}>
            {isProfitable ? '▲ In Profit' : '▼ In Loss'}
          </span>
          {trade.sl_distance !== null && (
            <span className={`text-[9px] ${trade.sl_distance < 2 ? 'text-accent-red' : 'text-text-muted'}`}>
              SL distance: {trade.sl_distance.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {trade.suggestions && trade.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {trade.suggestions.map((s: any, i: number) => (
            <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${
              s.type === 'danger' ? 'bg-accent-red/10 text-accent-red' :
              s.type === 'warning' ? 'bg-accent-yellow/10 text-accent-yellow' :
              s.type === 'take_profit' ? 'bg-accent-green/10 text-accent-green' :
              'bg-accent-blue/10 text-accent-blue'
            }`}>
              {s.text}
            </span>
          ))}
        </div>
      )}

      {/* AI Advice */}
      {aiAdvice && (
        <div className="mb-2.5 p-2 rounded-lg bg-accent-blue/5 border border-accent-blue/20 text-[10px] text-text-primary leading-relaxed">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-accent-blue font-semibold">AI Coach</span>
            <button onClick={() => { setAiAdvice(null); }} className="ml-auto text-text-muted hover:text-text-secondary">✕</button>
          </div>
          {aiAdvice}
        </div>
      )}
      {aiLoading && (
        <div className="mb-2.5 p-2 rounded-lg bg-bg-tertiary text-[10px] text-text-muted flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
          AI thinking...
        </div>
      )}

      {/* Action Buttons */}
      {!showCloseSlider ? (
        <div className="flex gap-1.5">
          <button onClick={fetchAiAdvice}
            className="text-[10px] px-2 py-1.5 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-all font-medium">
            AI
          </button>
          <button onClick={onModify}
            className="flex-1 text-[10px] py-1.5 rounded-lg bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 transition-all font-medium">
            Modify
          </button>
          <button onClick={() => onPartialClose(25)}
            className="text-[10px] px-2 py-1.5 rounded-lg bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 transition-all">
            25%
          </button>
          <button onClick={() => onPartialClose(50)}
            className="text-[10px] px-2 py-1.5 rounded-lg bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 transition-all">
            50%
          </button>
          <button onClick={() => setShowCloseSlider(true)}
            className="flex-1 text-[10px] py-1.5 rounded-lg bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-all font-medium">
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-text-muted shrink-0">Close {closePct}%</span>
            <input type="range" min={1} max={100} value={closePct}
              onChange={e => setClosePct(parseInt(e.target.value))}
              className="flex-1 accent-accent-red h-1" />
            <span className="font-mono text-text-primary w-8 text-right">{closePct}%</span>
          </div>
          <div className="flex gap-1.5">
            {[25, 50, 75, 100].map(p => (
              <button key={p} onClick={() => { setClosePct(p); if (p === 100) { onClose(); } else { onPartialClose(p); setShowCloseSlider(false); } }}
                className={`flex-1 text-[9px] py-1 rounded font-medium transition-all ${
                  closePct === p ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
                }`}>
                {p}%
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setShowCloseSlider(false)}
              className="flex-1 text-[10px] py-1.5 rounded-lg bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 transition-all">
              Cancel
            </button>
            <button onClick={() => {
              if (closePct >= 100) onClose();
              else { onPartialClose(closePct); setShowCloseSlider(false); }
            }}
              className="flex-[2] text-[10px] py-1.5 rounded-lg bg-accent-red/15 text-accent-red hover:bg-accent-red/25 transition-all font-bold">
              Close {closePct}% {closePct < 100 ? 'Partial' : 'Full'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ORDER CARD (Pending Orders) ─── */
function OrderCard({ order, onCancel, onModify }: {
  order: PendingOrder; onCancel: () => void; onModify: () => void;
}) {
  const isLong = order.side === 'long';
  const isLimit = order.type === 'limit';
  const triggerLabel = isLimit ? (isLong ? 'Price ≤' : 'Price ≥') : (isLong ? 'Price ≥' : 'Price ≤');
  const oqty = Number(order.quantity) || 0;

  return (
    <div className="glass p-3 relative overflow-hidden border border-border-primary/40">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{order.symbol.replace('USDT', '/USDT')}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
            isLong ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
          }`}>
            {isLong ? 'LONG' : 'SHORT'} {order.leverage}x
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-yellow/10 text-accent-yellow font-medium">
            {order.type === 'limit' ? 'LIMIT' : 'STOP'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue font-mono">
            Waiting
          </span>
        </div>
      </div>

      {/* Prices Grid */}
      <div className="grid grid-cols-3 gap-3 mb-2.5 text-[10px]">
        <div>
          <div className="text-text-muted mb-0.5">Entry</div>
          <div className="font-mono text-text-primary font-semibold">{formatPrice(order.entry_price)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Trigger</div>
          <div className="font-mono text-accent-yellow font-semibold">{triggerLabel} {formatPrice(order.entry_price)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Mark</div>
          <div className="font-mono text-text-primary font-semibold">{formatPrice(order.current_price)}</div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-3 gap-3 mb-2.5 text-[10px]">
        <div>
          <div className="text-text-muted mb-0.5">Size</div>
          <div className="font-mono text-text-primary">{oqty.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">Margin</div>
          <div className="font-mono text-text-primary">${order.margin.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">TP / SL</div>
          <div className="font-mono text-text-primary">
            {order.take_profit_1 ? formatPrice(order.take_profit_1) : '—'} / {order.stop_loss ? formatPrice(order.stop_loss) : '—'}
          </div>
        </div>
      </div>

      {/* No PnL, No TP progress, No duration - just waiting */}

      {/* Action Buttons */}
      <div className="flex gap-1.5">
        <button onClick={onModify}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 transition-all font-medium">
          Modify
        </button>
        <button onClick={onCancel}
          className="flex-1 text-[10px] py-1.5 rounded-lg bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-all font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── ACCOUNT SUMMARY ─── */
function AccountSummary({ acc, equity, usedMargin, freeBalance, stats, positions }: any) {
  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Account</div>
      <div className="space-y-1.5 text-[10px]">
        <div className="flex justify-between">
          <span className="text-text-muted">Balance</span>
          <span className="font-mono text-text-primary font-medium">${acc.balance.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Equity</span>
          <span className="font-mono text-text-primary font-medium">${equity.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Used Margin</span>
          <span className="font-mono text-accent-yellow">${usedMargin.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Free</span>
          <span className="font-mono text-accent-green">${Math.max(0, freeBalance).toFixed(2)}</span>
        </div>
        <div className="border-t border-border-primary pt-1.5 mt-1.5">
          <div className="flex justify-between">
            <span className="text-text-muted">Total PnL</span>
            <span className={`font-mono font-medium ${stats.totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Win Rate</span>
            <span className="font-mono text-text-primary">{stats.winRate}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Trades</span>
            <span className="font-mono text-text-primary">{stats.totalTrades}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">ROI</span>
            <span className={`font-mono ${stats.roi >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {stats.roi >= 0 ? '+' : ''}{stats.roi}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MINI ORDER BOOK ─── */
function MiniOrderBook({ symbol }: { symbol: string }) {
  const [ticker, setTicker] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const fetchTicker = async () => {
      try {
        if (active) setTicker(await getTicker(symbol));
      } catch {}
    };
    fetchTicker();
    const id = setInterval(fetchTicker, 5000);
    return () => { active = false; clearInterval(id); };
  }, [symbol]);

  const changeColor = ticker?.priceChangePercent >= 0 ? 'text-accent-green' : 'text-accent-red';
  const changeIcon = ticker?.priceChangePercent >= 0 ? '▲' : '▼';

  return (
    <div className="glass p-3 space-y-2">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Ticker</div>
      {ticker ? (
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold font-mono text-text-primary">
              ${formatPrice(ticker.lastPrice)}
            </span>
            <span className={`text-xs font-mono font-bold ${changeColor}`}>
              {changeIcon} {ticker.priceChangePercent?.toFixed(2)}%
            </span>
          </div>
          <div className="space-y-1 pt-1">
            <Row label="24h High" value={formatPrice(ticker.highPrice)} />
            <Row label="24h Low" value={formatPrice(ticker.lowPrice)} />
            <Row label="24h Vol" value={formatVolume(ticker.volume)} />
            <Row label="24h Turnover" value={`$${formatVolume(ticker.quoteVolume)}`} />
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-text-muted">Loading ticker...</div>
      )}

      <div className="border-t border-border-primary pt-2 mt-2">
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Order Book</div>
        <div className="text-[9px] flex items-center justify-between text-text-muted mb-1">
          <span>Price</span>
          <span>Qty</span>
          <span>Total</span>
        </div>
        {/* Simulated asks */}
        {[3, 2, 1].map(i => {
          const base = ticker?.lastPrice || 50000;
          const askPrice = base + i * 10;
          return (
            <div key={`a${i}`} className="flex items-center justify-between text-[9px] font-mono py-0.5">
              <span className="text-accent-red">{formatPrice(askPrice)}</span>
              <span className="text-text-muted">{(Math.random() * 2).toFixed(3)}</span>
              <span className="text-text-muted">${(askPrice * Math.random() * 2).toFixed(0)}</span>
            </div>
          );
        })}
        <div className="border-t border-border-primary my-1" />
        {/* Spread */}
        <div className="flex items-center justify-between text-[9px] font-mono py-0.5">
          <span className="text-accent-green font-bold">{ticker ? formatPrice(ticker.lastPrice) : '—'}</span>
          <span className="text-text-muted">Spread</span>
          <span className="text-text-muted">{(Math.random() * 10).toFixed(1)}</span>
        </div>
        <div className="border-t border-border-primary my-1" />
        {/* Simulated bids */}
        {[1, 2, 3].map(i => {
          const base = ticker?.lastPrice || 50000;
          const bidPrice = base - i * 10;
          return (
            <div key={`b${i}`} className="flex items-center justify-between text-[9px] font-mono py-0.5">
              <span className="text-accent-green">{formatPrice(bidPrice)}</span>
              <span className="text-text-muted">{(Math.random() * 2).toFixed(3)}</span>
              <span className="text-text-muted">${(bidPrice * Math.random() * 2).toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-primary">{value}</span>
    </div>
  );
}

/* ─── TRADE HISTORY ─── */
function TradeHistory({ trades }: { trades: any[] }) {
  const [filter, setFilter] = useState<'all' | 'win' | 'loss'>('all');
  const filtered = filter === 'all' ? trades : trades.filter((t: any) => filter === 'win' ? t.pnl >= 0 : t.pnl < 0);

  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold">Trade History</h3>
        <div className="flex gap-1">
          {(['all', 'win', 'loss'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[10px] px-2 py-0.5 rounded transition-all ${
                filter === f ? 'bg-accent-green/15 text-accent-green' : 'text-text-muted hover:text-text-secondary'
              }`}>
              {f === 'all' ? 'All' : f === 'win' ? 'Won' : 'Lost'}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 && (
        <div className="text-xs text-text-muted py-8 text-center">No trade history</div>
      )}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {filtered.map((t: any) => {
          const pnl = parseFloat(t.pnl) || 0;
          const pnlPct = parseFloat(t.pnl_percent) || 0;
          const isWin = pnl >= 0;
          const duration = t.closed_at && t.opened_at ? (() => {
            const ms = new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime();
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
          })() : '—';
          return (
            <div key={t.id} className={`flex items-center justify-between py-2 px-2 rounded-lg hover:bg-bg-tertiary/30 ${isWin ? 'gradient-green' : 'gradient-red'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold whitespace-nowrap">{t.symbol}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.side === 'long' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
                  {t.side?.toUpperCase()}
                </span>
                <span className="text-[10px] text-text-muted truncate max-w-[100px]">{t.reason || '—'}</span>
              </div>
              <div className="text-right flex items-center gap-3">
                <span className="text-[10px] text-text-muted">{duration}</span>
                <div>
                  <div className={`text-xs font-mono font-bold ${isWin ? 'text-accent-green' : 'text-accent-red'}`}>
                    {isWin ? '+' : ''}${pnl.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-text-muted">{formatPercent(pnlPct)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── MODIFY MODAL ─── */
function ModifyModal({ tradeId, positions, onSave, onMoveSlToBreakeven, onClose }: {
  tradeId: number; positions: LivePosition[]; onSave: (updates: any) => void;
  onMoveSlToBreakeven: () => void; onClose: () => void;
}) {
  const [stopLoss, setStopLoss] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [trailingStop, setTrailingStop] = useState('');

  const trade = useMemo(() => positions.find((p: LivePosition) => p.id === tradeId), [tradeId, positions]);
  useEffect(() => {
    if (trade) {
      setStopLoss(trade.stop_loss?.toString() || '');
      setTp1(trade.take_profit_1?.toString() || '');
      setTp2(trade.take_profit_2?.toString() || '');
      setTp3(trade.take_profit_3?.toString() || '');
      setTrailingStop(trade.trailing_stop?.toString() || '');
    }
  }, [tradeId]);

  if (!trade) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-1">Modify Position</h3>
        <p className="text-[10px] text-text-muted mb-3">{trade.symbol.replace('USDT', '/USDT')} · {trade.side.toUpperCase()} {trade.leverage}x</p>

        <div className="space-y-2.5">
          <ModifyInput label="Stop Loss" value={stopLoss} onChange={setStopLoss} placeholder={trade.stop_loss?.toString() || 'No SL'} />
          <ModifyInput label="Take Profit 1" value={tp1} onChange={setTp1} placeholder={trade.take_profit_1?.toString() || 'No TP1'} />
          <ModifyInput label="Take Profit 2" value={tp2} onChange={setTp2} placeholder={trade.take_profit_2?.toString() || 'No TP2'} />
          <ModifyInput label="Take Profit 3" value={tp3} onChange={setTp3} placeholder={trade.take_profit_3?.toString() || 'No TP3'} />
          <ModifyInput label="Trailing Stop %" value={trailingStop} onChange={setTrailingStop} placeholder={trade.trailing_stop?.toString() || 'Disabled'} />

          <button onClick={onMoveSlToBreakeven}
            className="w-full text-[10px] py-2 rounded-lg bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-all font-medium">
            Move SL to Breakeven
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 text-[10px] py-2 rounded-lg bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 transition-all">
            Cancel
          </button>
          <button onClick={() => onSave({
            stopLoss: stopLoss ? parseFloat(stopLoss) : null,
            tp1: tp1 ? parseFloat(tp1) : null,
            tp2: tp2 ? parseFloat(tp2) : null,
            tp3: tp3 ? parseFloat(tp3) : null,
            trailingStop: trailingStop ? parseFloat(trailingStop) : null,
          })}
            className="flex-1 text-[10px] py-2 rounded-lg bg-accent-green/15 text-accent-green hover:bg-accent-green/25 transition-all font-bold">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ModifyInput({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="text-[10px] text-text-muted block mb-0.5">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-bg-primary border border-border-primary rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
    </div>
  );
}

/* ─── ORDER MODIFY MODAL ─── */
function OrderModifyModal({ orderId, pendingOrders, onSave, onClose }: {
  orderId: number; pendingOrders: PendingOrder[]; onSave: (updates: any) => void; onClose: () => void;
}) {
  const order = pendingOrders.find((o: PendingOrder) => o.id === orderId);
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');

  useEffect(() => {
    if (order) {
      setEntryPrice(order.entry_price?.toString() || '');
      setStopLoss(order.stop_loss?.toString() || '');
      setTp1(order.take_profit_1?.toString() || '');
      setTp2(order.take_profit_2?.toString() || '');
      setTp3(order.take_profit_3?.toString() || '');
    }
  }, [order]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-1">Modify Order</h3>
        <p className="text-[10px] text-text-muted mb-3">{order.symbol.replace('USDT', '/USDT')} · {order.side.toUpperCase()} {order.type.toUpperCase()} {order.leverage}x</p>

        <div className="space-y-2.5">
          <ModifyInput label="Entry Price" value={entryPrice} onChange={setEntryPrice} placeholder={order.entry_price?.toString() || ''} />
          <ModifyInput label="Stop Loss" value={stopLoss} onChange={setStopLoss} placeholder={order.stop_loss?.toString() || 'No SL'} />
          <ModifyInput label="Take Profit 1" value={tp1} onChange={setTp1} placeholder={order.take_profit_1?.toString() || 'No TP1'} />
          <ModifyInput label="Take Profit 2" value={tp2} onChange={setTp2} placeholder={order.take_profit_2?.toString() || 'No TP2'} />
          <ModifyInput label="Take Profit 3" value={tp3} onChange={setTp3} placeholder={order.take_profit_3?.toString() || 'No TP3'} />
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 text-[10px] py-2 rounded-lg bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 transition-all">
            Cancel
          </button>
          <button onClick={() => onSave({
            entryPrice: entryPrice ? parseFloat(entryPrice) : null,
            stopLoss: stopLoss ? parseFloat(stopLoss) : null,
            tp1: tp1 ? parseFloat(tp1) : null,
            tp2: tp2 ? parseFloat(tp2) : null,
            tp3: tp3 ? parseFloat(tp3) : null,
          })}
            className="flex-1 text-[10px] py-2 rounded-lg bg-accent-green/15 text-accent-green hover:bg-accent-green/25 transition-all font-bold">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── CONFIRM MODAL ─── */
function ConfirmModal({ trade, onConfirm, onCancel }: any) {
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = async () => {
    setSubmitted(true);
    try {
      const res = await fetch('/api/paper/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error); }
    } catch {}
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-1">Confirm Order</h3>
        <p className="text-[10px] text-text-muted mb-3">{trade.symbol?.replace('USDT', '/USDT')}</p>
        <div className="space-y-2 text-[10px] bg-bg-primary rounded-lg p-3">
          <Row label="Side" value={trade.side?.toUpperCase()} />
          <Row label="Type" value={trade.orderType === 'stop' ? 'Stop' : 'Limit'} />
          <Row label="Price" value={`$${formatPrice(trade.entryPrice)}`} />
          <Row label="Quantity" value={trade.quantity?.toFixed(4)} />
          <Row label="Leverage" value={`${trade.leverage}x`} />
          {trade.stopLoss && <Row label="Stop Loss" value={`$${formatPrice(trade.stopLoss)}`} />}
          {trade.tp1 && <Row label="Take Profit" value={`$${formatPrice(trade.tp1)}`} />}
          <div className="border-t border-border-primary pt-2 mt-2">
            <Row label="Margin" value={`$${((trade.entryPrice * trade.quantity) / trade.leverage).toFixed(2)}`} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel}
            className="flex-1 text-[10px] py-2 rounded-lg bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 transition-all">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={submitted}
            className="flex-1 text-[10px] py-2 rounded-lg bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-all font-bold disabled:opacity-50">
            {submitted ? 'Placing...' : 'Confirm Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
