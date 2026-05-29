import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { formatPrice } from '../utils/format';

const PATTERN_ICONS: Record<string, string> = {
  double_top: 'M形态', double_bottom: 'W形态', head_and_shoulders: '头肩',
  ascending_triangle: '△上升', descending_triangle: '▽下降', symmetrical_triangle: '◇对称',
  bull_flag: '🚩牛旗', bear_flag: '🚩熊旗', breakout: '↑突破', breakdown: '↓跌破',
  support: '—支撑', resistance: '—阻力',
};

export function PatternDetection() {
  const { symbol, interval } = useAppStore();
  const [patterns, setPatterns] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/patterns/detect?symbol=${symbol}&interval=${interval}`);
        setPatterns(await res.json());
      } catch {}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [symbol, interval]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pattern Detection — {symbol}</h3>
        <span className="text-[10px] text-text-muted">{patterns?.count || 0} patterns</span>
      </div>

      {(!patterns?.patterns || patterns.patterns.length === 0) && (
        <div className="glass p-8 text-center">
          <div className="text-xs text-text-muted">No patterns detected</div>
          <div className="text-[10px] text-text-muted mt-1">Patterns will appear when market structure is identified</div>
        </div>
      )}

      {patterns?.patterns?.map((p: any, i: number) => (
        <div key={i} className={`glass p-3 ${p.direction === 'bullish' ? 'glow-green' : p.direction === 'bearish' ? 'glow-red' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">{PATTERN_ICONS[p.type] || '?'}</span>
              <span className="text-xs font-semibold capitalize">{p.type.replace(/_/g, ' ')}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                p.direction === 'bullish' ? 'bg-accent-green/10 text-accent-green' :
                p.direction === 'bearish' ? 'bg-accent-red/10 text-accent-red' :
                'bg-bg-primary text-text-muted'
              }`}>{p.direction}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${p.confidence >= 70 ? 'bg-accent-green' : p.confidence >= 50 ? 'bg-accent-yellow' : 'bg-accent-red'}`}
                  style={{ width: `${p.confidence}%` }} />
              </div>
              <span className="text-[10px] font-mono">{p.confidence}%</span>
            </div>
          </div>

          <p className="text-[11px] text-text-secondary mb-2">{p.description}</p>

          <div className="flex items-center gap-3 text-[10px]">
            {p.keyLevel && <span className="text-text-muted">Key: <span className="font-mono text-text-primary">{formatPrice(p.keyLevel)}</span></span>}
            {p.target && <span className="text-text-muted">Target: <span className="font-mono text-accent-green">{formatPrice(p.target)}</span></span>}
            {p.confirmed !== undefined && (
              <span className={`px-1.5 py-0.5 rounded ${p.confirmed ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-yellow/10 text-accent-yellow'}`}>
                {p.confirmed ? 'Confirmed' : 'Pending'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
