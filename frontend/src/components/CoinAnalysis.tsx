import { formatSymbol, formatPrice } from '../utils/format';
import type { CoinAnalysisData } from '../types/signal';

interface CoinAnalysisProps {
  analysis: CoinAnalysisData;
  coinSymbol: string;
  onBack: () => void;
  onFindTrade: () => void;
  onGenerateSignal: () => void;
}

function Badge({ label, color }: { label: string; color: 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'muted' }) {
  const c = {
    green: 'bg-accent-green/10 text-accent-green border-accent-green/20',
    red: 'bg-accent-red/10 text-accent-red border-accent-red/20',
    yellow: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
    blue: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    muted: 'bg-bg-primary/50 text-text-muted border-border-primary',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${c[color]}`}>{label}</span>;
}

function SentimentBar({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-accent-green' : score >= 40 ? 'bg-accent-yellow' : 'bg-accent-red';
  return (
    <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(5, score)}%`}} />
    </div>
  );
}

export function CoinAnalysis({ analysis, coinSymbol, onBack, onFindTrade, onGenerateSignal }: CoinAnalysisProps) {
  const trendColor = analysis.trend.direction === 'bullish' ? 'green' : analysis.trend.direction === 'bearish' ? 'red' : 'yellow';
  const rsiColor = analysis.rsi.condition === 'oversold' || analysis.rsi.condition === 'overbought' ? 'yellow' : analysis.rsi.condition === 'bearish' ? 'red' : analysis.rsi.condition === 'bullish' ? 'green' : 'muted';
  const macdColor = analysis.macd.condition === 'bullish' ? 'green' : analysis.macd.condition === 'bearish' ? 'red' : 'muted';
  const sentColor = analysis.sentiment.direction === 'bullish' ? 'green' : analysis.sentiment.direction === 'bearish' ? 'red' : 'yellow';
  const volColor = analysis.volume.condition === 'surge' || analysis.volume.condition === 'elevated' ? 'green' : analysis.volume.condition === 'low' ? 'red' : 'muted';

  return (
    <div className="space-y-3">
      <div className="glass-card p-3 border border-border-primary">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-primary">{formatSymbol(coinSymbol)}</span>
            <Badge label={analysis.exchange} color="blue" />
            <Badge label={analysis.timeframe} color="purple" />
          </div>
          <span className="font-mono text-sm font-bold text-text-primary">${formatPrice(analysis.price)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge label={`Trend: ${analysis.trend.direction} (${analysis.trend.strength}%)`} color={trendColor} />
          <Badge label={`RSI: ${analysis.rsi.value ?? '--'} ${analysis.rsi.condition}`} color={rsiColor} />
          <Badge label={`MACD: ${analysis.macd.condition}`} color={macdColor} />
          <Badge label={`Vol: ${analysis.volume.condition}`} color={volColor} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">Trend Analysis</div>
          <div className="space-y-1.5">
            <TrendRow label="Direction" value={analysis.trend.direction} color={trendColor} />
            <TrendRow label="Strength" value={`${analysis.trend.strength}%`} />
            <div className="w-full h-1 bg-bg-primary rounded-full overflow-hidden mt-1">
              <div className={`h-full rounded-full ${trendColor === 'green' ? 'bg-accent-green' : trendColor === 'red' ? 'bg-accent-red' : 'bg-accent-yellow'}`}
                style={{ width: `${analysis.trend.strength}%`}} />
            </div>
            <div className="text-[8px] text-text-muted">
              EMA9/20/50: {analysis.trend.ema9?.toFixed(2) ?? '--'} / {analysis.trend.ema20?.toFixed(2) ?? '--'} / {analysis.trend.ema50?.toFixed(2) ?? '--'}
            </div>
          </div>
        </div>

        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">RSI (14)</div>
          <div className="text-xl font-bold font-mono text-text-primary">{analysis.rsi.value?.toFixed(2) ?? '--'}</div>
          <div className="text-[9px] mt-1">
            <span className={`font-medium ${rsiColor === 'green' ? 'text-accent-green' : rsiColor === 'red' ? 'text-accent-red' : 'text-text-muted'}`}>
              {analysis.rsi.condition}
            </span>
          </div>
          <div className="w-full h-1 bg-bg-primary rounded-full overflow-hidden mt-2">
            <div className={`h-full rounded-full ${analysis.rsi.value != null && analysis.rsi.value > 70 ? 'bg-accent-red' : analysis.rsi.value != null && analysis.rsi.value < 30 ? 'bg-accent-green' : 'bg-accent-blue'}`}
              style={{ width: `${analysis.rsi.value != null ? Math.min(100, analysis.rsi.value) : 0}%`}} />
          </div>
        </div>

        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">MACD</div>
          <div className="space-y-0.5 text-[9px]">
            <div className="flex justify-between">
              <span className="text-text-muted">MACD:</span>
              <span className="font-mono text-text-primary">{analysis.macd.macd?.toFixed(6) ?? '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Signal:</span>
              <span className="font-mono text-text-primary">{analysis.macd.signal?.toFixed(6) ?? '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Histogram:</span>
              <span className={`font-mono ${analysis.macd.histogram != null && analysis.macd.histogram > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {analysis.macd.histogram?.toFixed(6) ?? '--'}
              </span>
            </div>
          </div>
          {analysis.macd.crossover && (
            <div className="mt-1 text-[8px] text-accent-yellow font-semibold">Crossover detected</div>
          )}
          <Badge label={analysis.macd.condition} color={macdColor} />
        </div>

        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">Volume</div>
          <div className="space-y-0.5 text-[9px]">
            <div className="flex justify-between">
              <span className="text-text-muted">Current:</span>
              <span className="font-mono text-text-primary">{analysis.volume.current != null ? formatCompact(analysis.volume.current) : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SMA(20):</span>
              <span className="font-mono text-text-primary">{analysis.volume.sma != null ? formatCompact(analysis.volume.sma) : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Ratio:</span>
              <span className={`font-mono ${analysis.volume.ratio != null && analysis.volume.ratio > 1.5 ? 'text-accent-green' : 'text-text-primary'}`}>
                {analysis.volume.ratio?.toFixed(2) ?? '--'}x
              </span>
            </div>
          </div>
          <Badge label={analysis.volume.condition} color={volColor} />
        </div>

        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">Volatility</div>
          <div className="text-xl font-bold font-mono text-text-primary">{analysis.volatility.atrPercent?.toFixed(2) ?? '--'}%</div>
          <div className="text-[9px] mt-1">
            <Badge label={analysis.volatility.level} color={analysis.volatility.level === 'high' ? 'yellow' : analysis.volatility.level === 'moderate' ? 'blue' : 'muted'} />
          </div>
          <div className="text-[8px] text-text-muted mt-1">ATR: {analysis.volatility.atr?.toFixed(4) ?? '--'}</div>
        </div>

        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">ADX</div>
          <div className="text-xl font-bold font-mono text-text-primary">{analysis.adx.value?.toFixed(2) ?? '--'}</div>
          <div className="text-[9px] mt-1">
            <Badge label={analysis.adx.condition} color={analysis.adx.condition === 'strong' ? 'green' : analysis.adx.condition === 'trending' ? 'blue' : 'muted'} />
          </div>
          <div className="text-[8px] text-text-muted mt-1">+DI: {analysis.adx.plusDI?.toFixed(2) ?? '--'} / -DI: {analysis.adx.minusDI?.toFixed(2) ?? '--'}</div>
        </div>
      </div>

      <div className="glass-card p-3 border border-border-primary">
        <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">Market Sentiment</div>
        <div className="flex items-center gap-3 mb-2">
          <SentimentBar score={analysis.sentiment.score} />
          <span className={`text-xs font-bold ${sentColor === 'green' ? 'text-accent-green' : sentColor === 'red' ? 'text-accent-red' : 'text-accent-yellow'}`}>
            {analysis.sentiment.direction} ({analysis.sentiment.score}%)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <div>
            <span className="text-text-muted">Bullish signals:</span>
            <span className="ml-1 text-accent-green font-bold">{analysis.sentiment.bullishSignals}</span>
          </div>
          <div>
            <span className="text-text-muted">Bearish signals:</span>
            <span className="ml-1 text-accent-red font-bold">{analysis.sentiment.bearishSignals}</span>
          </div>
        </div>
      </div>

      <div className="glass-card p-3 border border-border-primary">
        <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">Market Structure</div>
        <div className="flex items-center gap-2 mb-2">
          <Badge label={analysis.structure} color={analysis.structure === 'uptrend' ? 'green' : analysis.structure === 'downtrend' ? 'red' : 'muted'} />
          <Badge label={analysis.obv.condition} color={analysis.obv.condition === 'rising' ? 'green' : analysis.obv.condition === 'falling' ? 'red' : 'muted'} />
        </div>
        {analysis.keyLevels.length > 0 && (
          <div className="space-y-0.5 text-[8px]">
            <div className="text-text-muted">Key levels:</div>
            {analysis.keyLevels.map((level, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${level.type === 'support' ? 'bg-accent-green' : 'bg-accent-red'}`} />
                <span className="text-text-secondary">{level.type === 'support' ? 'Support' : 'Resistance'}: ${formatPrice(level.price)}</span>
                <span className="text-text-muted">({level.distance}%)</span>
              </div>
            ))}
          </div>
        )}
        {analysis.breakout && (
          <div className="mt-1 text-[8px] text-accent-green font-semibold">
            {analysis.breakout.type === 'bullish' ? 'Bullish' : 'Bearish'} breakout from ${formatPrice(analysis.breakout.level)}
          </div>
        )}
      </div>

      {analysis.mtf && (
        <div className="glass-card p-3 border border-border-primary">
          <div className="text-[9px] text-text-muted font-semibold uppercase mb-2">Multi-Timeframe Analysis</div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-accent-green">{analysis.mtf.bullCount}B</span>
            <span className="text-xs text-accent-red">{analysis.mtf.bearCount}Br</span>
            <span className="text-xs text-text-muted">{analysis.mtf.neutralCount}N</span>
            <Badge label={`${analysis.mtf.direction} (${analysis.mtf.score}%)`} color={analysis.mtf.direction === 'bullish' ? 'green' : analysis.mtf.direction === 'bearish' ? 'red' : 'yellow'} />
          </div>
          {analysis.mtf.details && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(analysis.mtf.details).map(([tf, dir]) => (
                <span key={tf} className={`text-[8px] px-1.5 py-0.5 rounded ${dir === 'bullish' ? 'bg-accent-green/10 text-accent-green' : dir === 'bearish' ? 'bg-accent-red/10 text-accent-red' : 'bg-bg-primary text-text-muted'}`}>
                  {tf}: {dir}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onBack}
          className="flex-1 py-2 rounded-lg bg-bg-primary/50 text-text-muted text-xs hover:text-text-secondary hover:bg-bg-primary/80 transition-all">
          Back
        </button>
        <button onClick={onFindTrade}
          className="flex-1 py-2 rounded-lg bg-accent-green/20 text-accent-green text-xs font-semibold hover:bg-accent-green/30 transition-all">
          Find Trade
        </button>
        <button onClick={onGenerateSignal}
          className="flex-1 py-2 rounded-lg bg-accent-purple/20 text-accent-purple text-xs font-semibold hover:bg-accent-purple/30 transition-all">
          Generate AI Signal
        </button>
      </div>
    </div>
  );
}

function TrendRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between text-[9px]">
      <span className="text-text-muted">{label}</span>
      <span className={`font-medium ${color === 'green' ? 'text-accent-green' : color === 'red' ? 'text-accent-red' : 'text-text-primary'}`}>{value}</span>
    </div>
  );
}

function formatCompact(num: number) {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(2);
}
