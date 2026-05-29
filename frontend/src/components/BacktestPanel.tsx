import { useState, useRef, useEffect } from 'react';
import { createChart, IChartApi, ColorType, Time, LineStyle } from 'lightweight-charts';
import { useAppStore } from '../stores/useAppStore';
import { runBacktest } from '../utils/backtestApi';
import { formatPrice, formatPercent } from '../utils/format';

interface BacktestResult {
  summary: {
    initialCapital: number;
    finalCapital: number;
    totalReturn: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  trades: {
    type: string;
    entry: number;
    exit: number;
    size: number;
    pnl: number;
    pnlPercent: number;
    reason: string;
    entryTime: number;
    exitTime: number;
    capitalAfter: number;
  }[];
  equityCurve: { time: number; value: number }[];
  symbol: string;
  interval: string;
  dataPoints: number;
}

export function BacktestPanel() {
  const { symbol, interval } = useAppStore();
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(90);
  const [error, setError] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await runBacktest(symbol, interval, days);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Render equity curve chart
  useEffect(() => {
    if (!result || !chartRef.current) return;

    if (chartApiRef.current) {
      chartApiRef.current.remove();
      chartApiRef.current = null;
    }

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 200,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.06)' },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.06)' },
    });

    const series = chart.addAreaSeries({
      topColor: result.summary.totalReturn >= 0 ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)',
      bottomColor: result.summary.totalReturn >= 0 ? 'rgba(0, 255, 136, 0.02)' : 'rgba(255, 51, 102, 0.02)',
      lineColor: result.summary.totalReturn >= 0 ? '#00FF88' : '#FF3366',
      lineWidth: 2,
    });

    series.setData(result.equityCurve.map(p => ({ time: p.time as Time, value: p.value })));
    chart.timeScale().fitContent();

    // Add initial capital reference line
    const refLine = chart.addLineSeries({
      color: 'rgba(255, 255, 255, 0.2)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    refLine.setData(result.equityCurve.map(p => ({ time: p.time as Time, value: result.summary.initialCapital })));

    chartApiRef.current = chart;

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartApiRef.current = null;
    };
  }, [result]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Controls */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold mb-3">Backtest Configuration</h3>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Symbol</label>
            <div className="text-xs font-mono text-text-primary bg-bg-primary px-3 py-1.5 rounded-lg">{symbol}</div>
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Timeframe</label>
            <div className="text-xs font-mono text-text-primary bg-bg-primary px-3 py-1.5 rounded-lg">{interval}</div>
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Period (days)</label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="bg-bg-primary border border-border-primary rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue/50"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
          <button
            onClick={runTest}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-accent-blue/20 text-accent-blue text-xs font-medium hover:bg-accent-blue/30 transition-colors disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-accent-red">{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Return" value={formatPercent(result.summary.totalReturn)} positive={result.summary.totalReturn >= 0} />
            <StatCard label="Win Rate" value={`${result.summary.winRate}%`} positive={result.summary.winRate >= 50} />
            <StatCard label="Profit Factor" value={result.summary.profitFactor.toFixed(2)} positive={result.summary.profitFactor >= 1} />
            <StatCard label="Sharpe Ratio" value={result.summary.sharpeRatio.toFixed(2)} positive={result.summary.sharpeRatio >= 1} />
            <StatCard label="Max Drawdown" value={`-${result.summary.maxDrawdown.toFixed(2)}%`} positive={false} />
            <StatCard label="Total Trades" value={result.summary.totalTrades.toString()} neutral />
            <StatCard label="Win/Loss" value={`${result.summary.winningTrades}/${result.summary.losingTrades}`} neutral />
            <StatCard label="Final Capital" value={`$${result.summary.finalCapital.toLocaleString()}`} positive={result.summary.totalReturn >= 0} />
          </div>

          {/* Equity curve */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold mb-3">Equity Curve</h3>
            <div ref={chartRef} className="w-full h-[200px]" />
          </div>

          {/* Trade history */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold mb-3">Trade History ({result.trades.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-muted border-b border-border-primary">
                    <th className="text-left py-2 pr-3">Type</th>
                    <th className="text-right py-2 px-3">Entry</th>
                    <th className="text-right py-2 px-3">Exit</th>
                    <th className="text-right py-2 px-3">PnL</th>
                    <th className="text-right py-2 px-3">PnL %</th>
                    <th className="text-left py-2 pl-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(-20).map((t, i) => (
                    <tr key={i} className="border-b border-border-primary/50 hover:bg-bg-tertiary/30">
                      <td className={`py-2 pr-3 font-medium ${t.type === 'long' ? 'text-accent-green' : 'text-accent-red'}`}>
                        {t.type.toUpperCase()}
                      </td>
                      <td className="text-right py-2 px-3 font-mono">{formatPrice(t.entry)}</td>
                      <td className="text-right py-2 px-3 font-mono">{formatPrice(t.exit)}</td>
                      <td className={`text-right py-2 px-3 font-mono font-medium ${t.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                      </td>
                      <td className={`text-right py-2 px-3 font-mono ${t.pnlPercent >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {formatPercent(t.pnlPercent)}
                      </td>
                      <td className="text-left py-2 pl-3 text-text-secondary">{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.trades.length > 20 && (
                <div className="text-center py-2 text-text-muted text-[10px]">Showing last 20 of {result.trades.length} trades</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, positive, neutral }: { label: string; value: string; positive?: boolean; neutral?: boolean }) {
  return (
    <div className="glass-card p-3">
      <div className="text-[10px] text-text-muted mb-1">{label}</div>
      <div className={`text-sm font-mono font-bold ${neutral ? 'text-text-primary' : positive ? 'text-accent-green' : 'text-accent-red'}`}>
        {value}
      </div>
    </div>
  );
}
