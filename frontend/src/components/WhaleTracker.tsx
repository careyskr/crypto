import { useState, useEffect } from 'react';

const TYPE_LABELS: Record<string, string> = {
  exchange_inflow: 'Exchange Inflow',
  exchange_outflow: 'Exchange Outflow',
  whale_transfer: 'Whale Transfer',
  stablecoin_move: 'Stablecoin Move',
};

export function WhaleTracker() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/whale/alerts');
        setData(await res.json());
      } catch {}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" /></div>;

  const sentiment = data?.sentiment;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Sentiment */}
      <div className="glass p-4 glow-blue">
        <h3 className="text-xs font-semibold mb-2">Whale Sentiment</h3>
        <div className="flex items-center gap-3">
          <div className={`text-lg font-bold ${sentiment?.sentiment === 'bullish' ? 'neon-green' : sentiment?.sentiment === 'bearish' ? 'neon-red' : 'text-text-muted'}`}>
            {sentiment?.sentiment?.toUpperCase()}
          </div>
          <div className="flex-1 h-2 bg-bg-primary rounded-full overflow-hidden">
            <div className="h-full bg-accent-green rounded-full transition-all" style={{ width: `${sentiment?.score || 50}%` }} />
          </div>
          <span className="text-xs font-mono">{sentiment?.score}%</span>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="glass p-3">
        <h3 className="text-xs font-semibold mb-2">Live Whale Alerts</h3>
        <div className="space-y-2">
          {data?.alerts?.map((alert: any) => (
            <div key={alert.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-bg-tertiary/30 transition-colors">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${alert.direction === 'bullish' ? 'bg-accent-green pulse-dot' : alert.direction === 'bearish' ? 'bg-accent-red pulse-dot' : 'bg-accent-yellow'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold">{alert.symbol}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    alert.direction === 'bullish' ? 'bg-accent-green/10 text-accent-green' :
                    alert.direction === 'bearish' ? 'bg-accent-red/10 text-accent-red' :
                    'bg-accent-yellow/10 text-accent-yellow'
                  }`}>{TYPE_LABELS[alert.type] || alert.type}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    alert.impact === 'high' ? 'bg-accent-red/10 text-accent-red' :
                    alert.impact === 'medium' ? 'bg-accent-yellow/10 text-accent-yellow' :
                    'bg-bg-primary text-text-muted'
                  }`}>{alert.impact}</span>
                </div>
                <div className="text-[10px] text-text-secondary">
                  {alert.amount.toLocaleString()} {alert.symbol} (${(alert.usdValue / 1e6).toFixed(2)}M)
                </div>
                <div className="text-[9px] text-text-muted mt-0.5">
                  {alert.fromAddress} → {alert.toAddress}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
