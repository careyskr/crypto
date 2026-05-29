import { calculateAllIndicators } from './indicators.js';
import { generateSignal } from './signalEngine.js';

export function runBacktest(klines, config = {}) {
  const {
    initialCapital = 10000,
    positionSizePercent = 2,    // % of capital per trade
    feePercent = 0.1,           // 0.1% per trade (Binance)
    slippagePercent = 0.05,     // 0.05% slippage
    minConfidence = 50,
    lookback = 100,             // candles to look back for signal generation
  } = config;

  const trades = [];
  let capital = initialCapital;
  let peakCapital = capital;
  let maxDrawdown = 0;
  let position = null; // { type: 'long'|'short', entry, sl, tp1, tp2, tp3, size, timestamp }

  // Walk forward through the data
  for (let i = lookback; i < klines.length; i++) {
    const windowKlines = klines.slice(0, i + 1);
    const currentCandle = klines[i];
    const currentPrice = currentCandle.close;

    // Check if we have an open position
    if (position) {
      let closed = false;
      let closeReason = '';
      let closePrice = currentPrice;

      // Check stop loss
      if (position.type === 'long' && currentCandle.low <= position.sl) {
        closed = true;
        closeReason = 'Stop Loss';
        closePrice = position.sl;
      } else if (position.type === 'short' && currentCandle.high >= position.sl) {
        closed = true;
        closeReason = 'Stop Loss';
        closePrice = position.sl;
      }

      // Check take profits
      if (!closed) {
        if (position.type === 'long') {
          if (currentCandle.high >= position.tp3) {
            closed = true;
            closeReason = 'TP3 Hit';
            closePrice = position.tp3;
          } else if (currentCandle.high >= position.tp2) {
            closed = true;
            closeReason = 'TP2 Hit';
            closePrice = position.tp2;
          } else if (currentCandle.high >= position.tp1) {
            closed = true;
            closeReason = 'TP1 Hit';
            closePrice = position.tp1;
          }
        } else {
          if (currentCandle.low <= position.tp3) {
            closed = true;
            closeReason = 'TP3 Hit';
            closePrice = position.tp3;
          } else if (currentCandle.low <= position.tp2) {
            closed = true;
            closeReason = 'TP2 Hit';
            closePrice = position.tp2;
          } else if (currentCandle.low <= position.tp1) {
            closed = true;
            closeReason = 'TP1 Hit';
            closePrice = position.tp1;
          }
        }
      }

      if (closed) {
        const fee = position.size * closePrice * (feePercent / 100);
        const slippage = position.size * closePrice * (slippagePercent / 100);

        let pnl;
        if (position.type === 'long') {
          pnl = (closePrice - position.entry) * position.size - fee - slippage;
        } else {
          pnl = (position.entry - closePrice) * position.size - fee - slippage;
        }

        capital += pnl;
        peakCapital = Math.max(peakCapital, capital);
        const drawdown = (peakCapital - capital) / peakCapital * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);

        trades.push({
          type: position.type,
          entry: position.entry,
          exit: closePrice,
          size: position.size,
          pnl: +pnl.toFixed(2),
          pnlPercent: +((pnl / (position.entry * position.size)) * 100).toFixed(2),
          reason: closeReason,
          entryTime: position.timestamp,
          exitTime: currentCandle.time,
          capitalAfter: +capital.toFixed(2),
        });

        position = null;
      }
    }

    // Generate new signal if no position
    if (!position && i % 5 === 0) { // Check every 5 candles
      try {
        const signal = generateSignal(windowKlines);

        if (signal.confidence >= minConfidence && signal.signal !== 'NEUTRAL') {
          const isBuy = signal.signal === 'BUY' || signal.signal === 'STRONG_BUY';
          const posSize = (capital * positionSizePercent / 100) / currentPrice;

          position = {
            type: isBuy ? 'long' : 'short',
            entry: currentPrice,
            sl: signal.riskReward.stopLoss,
            tp1: signal.riskReward.tp1,
            tp2: signal.riskReward.tp2,
            tp3: signal.riskReward.tp3,
            size: posSize,
            timestamp: currentCandle.time,
          };
        }
      } catch {}
    }
  }

  // Close any remaining position at last price
  if (position) {
    const lastPrice = klines[klines.length - 1].close;
    const fee = position.size * lastPrice * (feePercent / 100);
    let pnl;
    if (position.type === 'long') {
      pnl = (lastPrice - position.entry) * position.size - fee;
    } else {
      pnl = (position.entry - lastPrice) * position.size - fee;
    }
    capital += pnl;
    trades.push({
      type: position.type,
      entry: position.entry,
      exit: lastPrice,
      size: position.size,
      pnl: +pnl.toFixed(2),
      pnlPercent: +((pnl / (position.entry * position.size)) * 100).toFixed(2),
      reason: 'End of period',
      entryTime: position.timestamp,
      exitTime: klines[klines.length - 1].time,
      capitalAfter: +capital.toFixed(2),
    });
  }

  // Calculate statistics
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
  const totalReturn = ((capital - initialCapital) / initialCapital) * 100;

  // Sharpe ratio (simplified)
  if (trades.length > 1) {
    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length);
    var sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  } else {
    var sharpeRatio = 0;
  }

  // Equity curve
  const equityCurve = [{ time: klines[lookback]?.time || 0, value: initialCapital }];
  for (const trade of trades) {
    equityCurve.push({ time: trade.exitTime, value: trade.capitalAfter });
  }

  return {
    summary: {
      initialCapital,
      finalCapital: +capital.toFixed(2),
      totalReturn: +totalReturn.toFixed(2),
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: +winRate.toFixed(2),
      avgWin: +avgWin.toFixed(2),
      avgLoss: +avgLoss.toFixed(2),
      profitFactor: +profitFactor.toFixed(2),
      sharpeRatio: +sharpeRatio.toFixed(2),
      maxDrawdown: +maxDrawdown.toFixed(2),
    },
    trades,
    equityCurve,
  };
}
