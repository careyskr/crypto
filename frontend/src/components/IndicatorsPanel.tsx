import { useIndicatorStore } from '../stores/useIndicatorStore';

const OVERLAY_LABELS: Record<string, string> = {
  ema9: 'EMA 9',
  ema20: 'EMA 20',
  ema50: 'EMA 50',
  sma20: 'SMA 20',
  sma50: 'SMA 50',
  sma200: 'SMA 200',
  bb: 'Bollinger Bands',
  keltner: 'Keltner Channels',
};

const OSCILLATOR_LABELS: Record<string, string> = {
  rsi: 'RSI 14',
  macd: 'MACD 12/26/9',
  stochastic: 'Stochastic',
  adx: 'ADX 14',
  obv: 'OBV',
  atr: 'ATR 14',
  volumeSma: 'Volume SMA',
};

export function IndicatorsPanel() {
  const { overlays, oscillators, toggleOverlay, toggleOscillator } = useIndicatorStore();

  return (
    <div className="p-3 space-y-4">
      <div>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Chart Overlays</h3>
        <div className="space-y-1">
          {Object.entries(OVERLAY_LABELS).map(([key, label]) => {
            const config = overlays[key as keyof typeof overlays];
            return (
              <button
                key={key}
                onClick={() => toggleOverlay(key as keyof typeof overlays)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-tertiary/50 transition-colors text-left"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 transition-all"
                  style={{
                    borderColor: config.color,
                    backgroundColor: config.enabled ? config.color : 'transparent',
                  }}
                />
                <span className={`text-xs ${config.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
                  {label}
                </span>
                <div
                  className="w-4 h-0.5 rounded ml-auto"
                  style={{ backgroundColor: config.color, opacity: config.enabled ? 1 : 0.3 }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Oscillators</h3>
        <div className="space-y-1">
          {Object.entries(OSCILLATOR_LABELS).map(([key, label]) => {
            const config = oscillators[key as keyof typeof oscillators];
            return (
              <button
                key={key}
                onClick={() => toggleOscillator(key as keyof typeof oscillators)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-tertiary/50 transition-colors text-left"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 transition-all"
                  style={{
                    borderColor: config.color,
                    backgroundColor: config.enabled ? config.color : 'transparent',
                  }}
                />
                <span className={`text-xs ${config.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
