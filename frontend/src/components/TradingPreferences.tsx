import { useState, useEffect } from 'react';
import type { TradingPreferences as Prefs, TradingMode, RiskLevel, TradeDirection, SupportedExchange } from '../types/signal';
import { getPreferences, savePreferences } from '../utils/aiApi';

const TRADING_MODES: { id: TradingMode; label: string; desc: string }[] = [
  { id: 'scalping', label: 'Scalping', desc: '1m-15m, quick entries' },
  { id: 'intraday', label: 'Intraday', desc: '15m-4H, daily trades' },
  { id: 'swing', label: 'Swing', desc: '4H-1D, multi-day' },
  { id: 'spot', label: 'Spot', desc: '1H-1D, long-term' },
  { id: 'futures', label: 'Futures', desc: '15m-4H, leveraged' },
];

const RISK_LEVELS: { id: RiskLevel; label: string; desc: string }[] = [
  { id: 'safe', label: 'Safe', desc: 'Max 3x leverage, 80%+ confidence' },
  { id: 'moderate', label: 'Moderate', desc: 'Max 5x leverage, 65%+ confidence' },
  { id: 'aggressive', label: 'Aggressive', desc: 'Max 10x leverage, 50%+ confidence' },
];

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

const DIRECTIONS: { id: TradeDirection; label: string }[] = [
  { id: 'long', label: 'Long Only' },
  { id: 'short', label: 'Short Only' },
  { id: 'both', label: 'Both' },
];

const EXCHANGES: { id: SupportedExchange; label: string }[] = [
  { id: 'binance', label: 'Binance' },
  { id: 'bybit', label: 'Bybit' },
  { id: 'okx', label: 'OKX' },
  { id: 'kucoin', label: 'KuCoin' },
  { id: 'coinbase', label: 'Coinbase' },
  { id: 'kraken', label: 'Kraken' },
  { id: 'all', label: 'All Exchanges' },
];

interface Props {
  onComplete: (prefs: Prefs) => void;
  initial?: Partial<Prefs>;
}

export function TradingPreferences({ onComplete, initial }: Props) {
  const [prefs, setPrefs] = useState<Prefs>({
    tradingMode: (initial?.tradingMode as TradingMode) || 'intraday',
    riskLevel: (initial?.riskLevel as RiskLevel) || 'moderate',
    timeframe: initial?.timeframe || '1h',
    direction: (initial?.direction as TradeDirection) || 'both',
    exchange: (initial?.exchange as SupportedExchange) || 'binance',
    marketType: initial?.marketType || 'spot',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPreferences().then(p => {
      if (p) {
        setPrefs(prev => ({
          ...prev,
          ...p,
          ...initial,
        }));
      }
    }).catch(() => {});
  }, []);

  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await savePreferences(prefs);
      onComplete(prefs);
    } catch {
      onComplete(prefs);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Trading Mode */}
      <div>
        <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Trading Mode</div>
        <div className="grid grid-cols-5 gap-1.5">
          {TRADING_MODES.map(m => (
            <button key={m.id} onClick={() => update('tradingMode', m.id)}
              className={`px-2 py-2 rounded-lg text-[10px] font-medium transition-all text-center ${
                prefs.tradingMode === m.id
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                  : 'bg-bg-primary/50 text-text-muted hover:text-text-secondary border border-transparent'
              }`}>
              <div>{m.label}</div>
              <div className="text-[7px] opacity-60 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Risk Level */}
      <div>
        <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Risk Level</div>
        <div className="grid grid-cols-3 gap-1.5">
          {RISK_LEVELS.map(r => (
            <button key={r.id} onClick={() => update('riskLevel', r.id)}
              className={`px-2 py-2 rounded-lg text-[10px] font-medium transition-all text-center ${
                prefs.riskLevel === r.id
                  ? r.id === 'safe' ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                    : r.id === 'moderate' ? 'bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40'
                    : 'bg-accent-red/20 text-accent-red border border-accent-red/40'
                  : 'bg-bg-primary/50 text-text-muted hover:text-text-secondary border border-transparent'
              }`}>
              <div>{r.label}</div>
              <div className="text-[7px] opacity-60 mt-0.5">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Timeframe */}
      <div>
        <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Preferred Timeframe</div>
        <div className="flex flex-wrap gap-1">
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => update('timeframe', tf)}
              className={`px-2.5 py-1.5 text-[10px] font-mono font-medium rounded transition-all ${
                prefs.timeframe === tf
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                  : 'bg-bg-primary/50 text-text-muted hover:text-text-secondary border border-transparent'
              }`}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Trade Direction */}
      <div>
        <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Trade Direction</div>
        <div className="flex gap-1.5">
          {DIRECTIONS.map(d => (
            <button key={d.id} onClick={() => update('direction', d.id)}
              className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-all ${
                prefs.direction === d.id
                  ? d.id === 'long' ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                    : d.id === 'short' ? 'bg-accent-red/20 text-accent-red border border-accent-red/40'
                    : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                  : 'bg-bg-primary/50 text-text-muted hover:text-text-secondary border border-transparent'
              }`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange */}
      <div>
        <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Exchange</div>
        <div className="flex flex-wrap gap-1">
          {EXCHANGES.map(e => (
            <button key={e.id} onClick={() => update('exchange', e.id)}
              className={`px-2.5 py-1.5 text-[10px] font-medium rounded transition-all ${
                prefs.exchange === e.id
                  ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40'
                  : 'bg-bg-primary/50 text-text-muted hover:text-text-secondary border border-transparent'
              }`}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Market Type */}
      <div>
        <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Market Type</div>
        <div className="flex gap-1.5">
          {(['spot', 'futures'] as const).map(mt => (
            <button key={mt} onClick={() => update('marketType', mt)}
              className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-all ${
                prefs.marketType === mt
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                  : 'bg-bg-primary/50 text-text-muted hover:text-text-secondary border border-transparent'
              }`}>
              {mt.charAt(0).toUpperCase() + mt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Confirm Button */}
      <button onClick={handleConfirm} disabled={saving}
        className="w-full py-2.5 rounded-lg bg-accent-green/20 text-accent-green text-xs font-bold hover:bg-accent-green/30 transition-all disabled:opacity-50 neon-green">
        {saving ? 'Saving...' : 'Confirm Preferences & Generate Signal'}
      </button>
    </div>
  );
}
