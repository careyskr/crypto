import { formatPrice, formatPercent } from '../utils/format';
import type { SignalData } from '../types/signal';

const SIGNAL_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  STRONG_BUY: { bg: 'bg-accent-green/10', text: 'text-accent-green', border: 'border-accent-green/30', glow: 'glow-green' },
  BUY: { bg: 'bg-accent-green/5', text: 'text-accent-green', border: 'border-accent-green/20', glow: '' },
  NEUTRAL: { bg: 'bg-text-muted/5', text: 'text-text-muted', border: 'border-border-primary', glow: '' },
  SELL: { bg: 'bg-accent-red/5', text: 'text-accent-red', border: 'border-accent-red/20', glow: '' },
  STRONG_SELL: { bg: 'bg-accent-red/10', text: 'text-accent-red', border: 'border-accent-red/30', glow: 'glow-red' },
};

const SIGNAL_LABELS: Record<string, string> = {
  STRONG_BUY: 'STRONG BUY',
  BUY: 'BUY',
  NEUTRAL: 'NEUTRAL',
  SELL: 'SELL',
  STRONG_SELL: 'STRONG SELL',
};

export function SignalCard({ signal, compact = false }: { signal: SignalData; compact?: boolean }) {
  const colors = SIGNAL_COLORS[signal.signal] || SIGNAL_COLORS.NEUTRAL;

  if (compact) {
    return (
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${colors.bg} border ${colors.border} ${colors.glow}`}>
        <div className={`text-xs font-bold ${colors.text} min-w-[80px]`}>{SIGNAL_LABELS[signal.signal]}</div>
        <div className="flex-1 text-xs text-text-secondary font-mono">{signal.symbol}</div>
        <div className="flex items-center gap-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            signal.direction === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
          }`}>{signal.direction}</span>
          <span className="text-xs text-text-muted">{signal.confidence}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card p-4 ${colors.glow}`}>
      {/* Signal header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-md text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
            {SIGNAL_LABELS[signal.signal]}
          </div>
          <span className={`text-[10px] px-2 py-1 rounded font-bold ${
            signal.direction === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
          }`}>{signal.direction}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Confidence</span>
          <div className="w-16 h-1.5 bg-bg-primary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${signal.confidence >= 70 ? 'bg-accent-green' : signal.confidence >= 40 ? 'bg-accent-yellow' : 'bg-accent-red'}`}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className="text-xs font-mono text-text-primary">{signal.confidence}%</span>
        </div>
      </div>

      {/* Coin + Exchange + Meta */}
      <div className="flex items-center gap-2 mb-3 text-[10px] text-text-muted">
        <span className="text-xs font-semibold text-text-primary">{signal.symbol.replace('USDT', '/USDT')}</span>
        <span className="px-1.5 py-0.5 rounded bg-bg-primary/50 capitalize">{signal.exchange}</span>
        <span className="px-1.5 py-0.5 rounded bg-bg-primary/50">{signal.tradingMode}</span>
        <span className="px-1.5 py-0.5 rounded bg-bg-primary/50">{signal.timeframe}</span>
      </div>

      {/* Entry / SL / TP */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {signal.entryZone && (
          <div className="bg-bg-primary/50 rounded-lg p-2">
            <div className="text-[10px] text-text-muted">Entry Zone</div>
            <div className="text-xs font-mono text-text-primary">${formatPrice(signal.entryZone.low)} - ${formatPrice(signal.entryZone.high)}</div>
          </div>
        )}
        <div className="bg-bg-primary/50 rounded-lg p-2">
          <div className="text-[10px] text-text-muted">Stop Loss</div>
          <div className="text-xs font-mono text-accent-red">${formatPrice(signal.stopLoss)}</div>
        </div>
        {signal.takeProfits && (
          <>
            <div className="bg-bg-primary/50 rounded-lg p-2">
              <div className="text-[10px] text-text-muted">TP1</div>
              <div className="text-xs font-mono text-accent-green">${formatPrice(signal.takeProfits.tp1)}</div>
            </div>
            <div className="bg-bg-primary/50 rounded-lg p-2">
              <div className="text-[10px] text-text-muted">TP2</div>
              <div className="text-xs font-mono text-accent-green">${formatPrice(signal.takeProfits.tp2)}</div>
            </div>
          </>
        )}
      </div>

      {/* R:R + Risk + Leverage */}
      <div className="grid grid-cols-3 gap-2 mb-3 px-1">
        <div>
          <span className="text-[9px] text-text-muted">R:R</span>
          <div className={`text-xs font-mono font-bold ${signal.rrRatio >= 2 ? 'text-accent-green' : 'text-accent-red'}`}>
            {signal.rrRatio}:1
          </div>
        </div>
        <div>
          <span className="text-[9px] text-text-muted">Risk</span>
          <div className="text-xs font-mono font-bold text-accent-yellow">{signal.riskPercent}%</div>
        </div>
        <div>
          <span className="text-[9px] text-text-muted">Leverage</span>
          <div className="text-xs font-mono font-bold text-accent-blue">{signal.suggestedLeverage}x</div>
        </div>
      </div>

      {/* Key indicators */}
      <div className="flex flex-wrap gap-2 mb-3">
        {signal.indicators?.rsi !== null && signal.indicators?.rsi !== undefined && (
          <span className="text-[10px] bg-bg-primary/50 px-2 py-1 rounded text-text-secondary">
            RSI: <span className="font-mono text-text-primary">{signal.indicators.rsi}</span>
          </span>
        )}
        {signal.indicators?.adx !== null && signal.indicators?.adx !== undefined && (
          <span className="text-[10px] bg-bg-primary/50 px-2 py-1 rounded text-text-secondary">
            ADX: <span className="font-mono text-text-primary">{signal.indicators.adx}</span>
          </span>
        )}
      </div>

      {/* AI Explanation */}
      {signal.explanation && (
        <div className="mt-3 pt-3 border-t border-border-primary">
          <div className="text-[10px] text-accent-blue uppercase font-semibold mb-1.5">AI Analysis</div>
          <p className="text-xs text-text-secondary leading-relaxed">{signal.explanation}</p>
        </div>
      )}
    </div>
  );
}
