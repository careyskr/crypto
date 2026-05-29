import { formatSymbol } from '../utils/format';

interface CoinActionPanelProps {
  symbol: string;
  onAnalyze: () => void;
  onFindTrade: () => void;
  onGenerateSignal: () => void;
  onDismiss: () => void;
  onBackToMarketScan: () => void;
}

export function CoinActionPanel({ symbol, onAnalyze, onFindTrade, onGenerateSignal, onDismiss, onBackToMarketScan }: CoinActionPanelProps) {
  return (
    <div className="glass-card p-4 border border-border-primary">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-bold text-text-primary">{formatSymbol(symbol)}</span>
          <span className="ml-2 text-[10px] text-text-muted">Selected</span>
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-text-primary transition-colors text-xs">
          ✕
        </button>
      </div>

      <div className="text-[10px] text-text-muted mb-3">
        What would you like to do with this coin?
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={onAnalyze}
          className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-bg-primary/50 hover:bg-accent-blue/10 border border-border-primary hover:border-accent-blue/30 transition-all group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-blue">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-[9px] font-semibold text-text-secondary group-hover:text-accent-blue transition-colors">Analyze Coin</span>
          <span className="text-[7px] text-text-muted text-center leading-tight">Trend, RSI, MACD, S/R</span>
        </button>

        <button onClick={onFindTrade}
          className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-bg-primary/50 hover:bg-accent-green/10 border border-border-primary hover:border-accent-green/30 transition-all group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-green">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span className="text-[9px] font-semibold text-text-secondary group-hover:text-accent-green transition-colors">Find Trade</span>
          <span className="text-[7px] text-text-muted text-center leading-tight">Check for opportunity</span>
        </button>

        <button onClick={onGenerateSignal}
          className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-bg-primary/50 hover:bg-accent-purple/10 border border-border-primary hover:border-accent-purple/30 transition-all group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-purple">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="text-[9px] font-semibold text-text-secondary group-hover:text-accent-purple transition-colors">AI Signal</span>
          <span className="text-[7px] text-text-muted text-center leading-tight">Generate with config</span>
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-border-primary">
        <button onClick={onBackToMarketScan}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[10px] font-medium text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 border border-border-primary hover:border-accent-blue/30 transition-all group">
          <span className="text-xs">←</span>
          <span>Market Scan</span>
        </button>
      </div>
    </div>
  );
}
