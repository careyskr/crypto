import { useState, useEffect } from 'react';
import { formatPrice, formatPercent } from '../utils/format';

export function AnalyticsDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t] = await Promise.all([
          fetch('/api/paper/stats').then(r => r.json()),
          fetch('/api/paper/trades?limit=100').then(r => r.json()),
        ]);
        setStats(s);
        setSignals(t);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" /></div>;

  const wins = signals.filter(t => t.pnl > 0);
  const losses = signals.filter(t => t.pnl <= 0 && t.status === 'closed');
  const closedTrades = signals.filter(t => t.status === 'closed');

  // Best/Worst pairs
  const pairPnl: Record<string, number> = {};
  closedTrades.forEach(t => { pairPnl[t.symbol] = (pairPnl[t.symbol] || 0) + t.pnl; });
  const sortedPairs = Object.entries(pairPnl).sort(([, a], [, b]) => b - a);
  const bestPair = sortedPairs[0];
  const worstPair = sortedPairs[sortedPairs.length - 1];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h2 className="text-sm font-semibold">Signal Analytics</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Signals" value={stats?.totalTrades || 0} />
        <MetricCard label="Win Rate" value={`${stats?.winRate || 0}%`} positive={parseFloat(stats?.winRate) > 50} />
        <MetricCard label="Profit Factor" value={stats?.profitFactor || 0} positive={parseFloat(stats?.profitFactor) > 1} />
        <MetricCard label="Total ROI" value={`${stats?.roi || 0}%`} positive={parseFloat(stats?.roi) > 0} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Wins" value={stats?.winCount || 0} positive />
        <MetricCard label="Losses" value={stats?.lossCount || 0} negative />
        <MetricCard label="Avg Win" value={`$${stats?.avgWin || 0}`} positive />
        <MetricCard label="Avg Loss" value={`$${stats?.avgLoss || 0}`} negative />
      </div>

      {/* Best/Worst Pairs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass p-3 glow-green">
          <div className="text-[10px] text-text-muted mb-1">Best Pair</div>
          <div className="text-sm font-bold text-accent-green">{bestPair ? bestPair[0] : 'N/A'}</div>
          {bestPair && <div className="text-xs font-mono text-accent-green">+${bestPair[1].toFixed(2)}</div>}
        </div>
        <div className="glass p-3 glow-red">
          <div className="text-[10px] text-text-muted mb-1">Worst Pair</div>
          <div className="text-sm font-bold text-accent-red">{worstPair ? worstPair[0] : 'N/A'}</div>
          {worstPair && <div className="text-xs font-mono text-accent-red">${worstPair[1].toFixed(2)}</div>}
        </div>
      </div>

      {/* Streaks */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass p-3"><div className="text-[10px] text-text-muted">Max Win Streak</div><div className="text-lg font-mono font-bold text-accent-green">{stats?.maxWinStreak || 0}</div></div>
        <div className="glass p-3"><div className="text-[10px] text-text-muted">Max Loss Streak</div><div className="text-lg font-mono font-bold text-accent-red">{stats?.maxLossStreak || 0}</div></div>
      </div>

      {/* Equity Curve */}
      {stats?.equityCurve && stats.equityCurve.length > 1 && (
        <div className="glass p-3">
          <div className="text-[10px] text-text-muted mb-2">Equity Curve</div>
          <EquityCurve data={stats.equityCurve} initial={stats.account.initial_balance} />
        </div>
      )}

      {/* Daily PnL Heatmap */}
      {stats?.dailyPnl && Object.keys(stats.dailyPnl).length > 0 && (
        <div className="glass p-3">
          <div className="text-[10px] text-text-muted mb-2">Daily PnL</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(stats.dailyPnl).slice(-30).map(([day, pnl]: [string, any]) => (
              <div key={day} className="group relative">
                <div className={`w-6 h-6 rounded ${pnl >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`}
                  style={{ opacity: Math.min(1, Math.abs(pnl) / 50 + 0.2) }} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-bg-secondary text-[9px] text-text-primary px-2 py-1 rounded whitespace-nowrap z-10">
                  {day}: {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EquityCurve({ data, initial }: { data: any[]; initial: number }) {
  const values = data.map(d => d.value);
  const min = Math.min(...values) * 0.999;
  const max = Math.max(...values) * 1.001;
  const range = max - min || 1;
  const h = 80;
  const w = 300;

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - ((d.value - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const isUp = values[values.length - 1] >= initial;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? '#00FF88' : '#FF3366'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isUp ? '#00FF88' : '#FF3366'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#eqGrad)" />
      <polyline points={points} fill="none" stroke={isUp ? '#00FF88' : '#FF3366'} strokeWidth="1.5" />
      {/* Initial balance line */}
      <line x1="0" y1={h - ((initial - min) / range) * h} x2={w} y2={h - ((initial - min) / range) * h}
        stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="4" />
    </svg>
  );
}

function MetricCard({ label, value, positive, negative }: any) {
  return (
    <div className="glass p-3">
      <div className="text-[10px] text-text-muted mb-1">{label}</div>
      <div className={`text-sm font-mono font-bold ${positive ? 'text-accent-green' : negative ? 'text-accent-red' : 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
