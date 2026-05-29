import { useState, useEffect, useRef, memo } from 'react';
import { formatPrice, formatVolume } from '../utils/format';

interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBookData {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  spreadPercent: number;
}

export const OrderBook = memo(function OrderBook({ symbol }: { symbol: string }) {
  const [data, setData] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@100ms`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        console.log('OrderBook WS connected');
        setLoading(false);
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data);
          const bids = (msg.bids || []).slice(0, 15).map(([p, q]: [string, string]) => ({
            price: parseFloat(p),
            quantity: parseFloat(q),
            total: parseFloat(p) * parseFloat(q),
          }));
          const asks = (msg.asks || []).slice(0, 15).map(([p, q]: [string, string]) => ({
            price: parseFloat(p),
            quantity: parseFloat(q),
            total: parseFloat(p) * parseFloat(q),
          }));

          const spread = asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0;
          const spreadPercent = bids.length > 0 ? (spread / bids[0].price) * 100 : 0;

          // Calculate cumulative totals for depth visualization
          let bidCum = 0;
          for (const b of bids) { bidCum += b.quantity; b.total = bidCum; }
          let askCum = 0;
          for (const a of asks) { askCum += a.quantity; a.total = askCum; }

          setData({ bids, asks, spread, spreadPercent });
        } catch {}
      };

      ws.onclose = () => {
        if (!cancelled) reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [symbol]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-4 h-4 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
      </div>
    );
  }

  const maxBidQty = Math.max(...data.bids.map(b => b.quantity));
  const maxAskQty = Math.max(...data.asks.map(a => a.quantity));
  const maxQty = Math.max(maxBidQty, maxAskQty);

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border-primary">
        <span className="text-text-muted">Order Book</span>
        <span className="text-text-muted">{symbol}</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-2 py-1 text-text-muted">
        <span className="flex-1">Price</span>
        <span className="w-16 text-right">Size</span>
        <span className="w-16 text-right">Total</span>
      </div>

      {/* Asks (reversed so lowest is at bottom) */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {data.asks.slice(0, 12).reverse().map((ask, i) => (
          <div key={`ask-${i}`} className="relative flex items-center px-2 py-0.5 hover:bg-bg-tertiary/30">
            <div className="absolute inset-0 bg-accent-red/8" style={{ width: `${(ask.quantity / maxQty) * 100}%` }} />
            <span className="flex-1 text-accent-red relative z-10">{formatPrice(ask.price)}</span>
            <span className="w-16 text-right text-text-secondary relative z-10">{ask.quantity.toFixed(4)}</span>
            <span className="w-16 text-right text-text-muted relative z-10">{formatVolume(ask.total)}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-center px-2 py-1.5 border-y border-border-primary bg-bg-primary/50">
        <span className="text-accent-yellow font-bold">{formatPrice(data.bids[0]?.price || 0)}</span>
        <span className="text-text-muted mx-2">|</span>
        <span className="text-text-muted">Spread: {data.spreadPercent.toFixed(4)}%</span>
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-hidden">
        {data.bids.slice(0, 12).map((bid, i) => (
          <div key={`bid-${i}`} className="relative flex items-center px-2 py-0.5 hover:bg-bg-tertiary/30">
            <div className="absolute inset-0 bg-accent-green/8" style={{ width: `${(bid.quantity / maxQty) * 100}%` }} />
            <span className="flex-1 text-accent-green relative z-10">{formatPrice(bid.price)}</span>
            <span className="w-16 text-right text-text-secondary relative z-10">{bid.quantity.toFixed(4)}</span>
            <span className="w-16 text-right text-text-muted relative z-10">{formatVolume(bid.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
