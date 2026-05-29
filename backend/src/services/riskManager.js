/**
 * Smart Risk Management System
 * Position sizing, leverage recommendations, liquidation warnings
 */
export function calculateRisk(params) {
  const {
    balance,
    riskPercent,
    entryPrice,
    stopLoss,
    leverage = 1,
    side = 'long',
    atr,
  } = params;

  if (!balance || !entryPrice || !stopLoss) {
    return { error: 'Missing required parameters' };
  }

  const riskAmount = balance * (riskPercent / 100);
  const priceRisk = Math.abs(entryPrice - stopLoss);
  const riskPctOfPrice = (priceRisk / entryPrice) * 100;

  // Position size
  const positionSize = riskAmount / priceRisk;
  const positionValue = positionSize * entryPrice;
  const margin = positionValue / leverage;

  // Liquidation price
  const maintenanceMargin = 0.005; // 0.5%
  let liquidationPrice;
  if (side === 'long') {
    liquidationPrice = entryPrice * (1 - (1 / leverage) + maintenanceMargin);
  } else {
    liquidationPrice = entryPrice * (1 + (1 / leverage) - maintenanceMargin);
  }

  // Take profits based on R:R
  const risk = priceRisk;
  let tp1, tp2, tp3;
  if (side === 'long') {
    tp1 = entryPrice + risk * 1.5;
    tp2 = entryPrice + risk * 2.5;
    tp3 = entryPrice + risk * 4;
  } else {
    tp1 = entryPrice - risk * 1.5;
    tp2 = entryPrice - risk * 2.5;
    tp3 = entryPrice - risk * 4;
  }

  // Max recommended leverage based on volatility
  let recommendedLeverage = 1;
  if (atr && entryPrice) {
    const atrPct = (atr / entryPrice) * 100;
    if (atrPct < 1) recommendedLeverage = 20;
    else if (atrPct < 2) recommendedLeverage = 10;
    else if (atrPct < 3) recommendedLeverage = 5;
    else if (atrPct < 5) recommendedLeverage = 3;
    else recommendedLeverage = 1;
  }

  // Warnings
  const warnings = [];
  if (margin > balance * 0.5) warnings.push('Position uses >50% of balance');
  if (leverage > recommendedLeverage) warnings.push(`Leverage ${leverage}x exceeds recommended ${recommendedLeverage}x`);
  if (riskPctOfPrice > 5) warnings.push('Stop loss is very wide (>5%)');
  if (leverage >= 10 && riskPctOfPrice > 2) warnings.push('High leverage with wide stop — liquidation risk');
  if (side === 'long' && liquidationPrice > stopLoss * 0.95) warnings.push('Stop loss near liquidation price');
  if (riskPercent > 5) warnings.push('Risk per trade exceeds 5% — consider reducing');

  return {
    positionSize: +positionSize.toFixed(8),
    positionValue: +positionValue.toFixed(2),
    margin: +margin.toFixed(2),
    riskAmount: +riskAmount.toFixed(2),
    riskPercent: +riskPctOfPrice.toFixed(2),
    liquidationPrice: +liquidationPrice.toFixed(8),
    takeProfits: {
      tp1: +tp1.toFixed(8),
      tp2: +tp2.toFixed(8),
      tp3: +tp3.toFixed(8),
    },
    rrRatios: { tp1: 1.5, tp2: 2.5, tp3: 4 },
    recommendedLeverage,
    warnings,
    isValid: warnings.length === 0,
  };
}

export function getDailyRiskSummary(trades, balance) {
  const today = new Date().toISOString().split('T')[0];
  const todayTrades = trades.filter(t => {
    const tradeDay = new Date(t.opened_at).toISOString().split('T')[0];
    return tradeDay === today;
  });

  const todayPnl = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const todayRisk = todayTrades.reduce((s, t) => {
    const risk = Math.abs(t.entry_price - (t.stop_loss || t.entry_price)) * t.quantity;
    return s + risk;
  }, 0);

  const maxDailyLoss = balance * 0.05; // 5% daily max

  return {
    todayTrades: todayTrades.length,
    todayPnl: +todayPnl.toFixed(2),
    todayRisk: +todayRisk.toFixed(2),
    maxDailyLoss: +maxDailyLoss.toFixed(2),
    remainingRisk: +(maxDailyLoss - Math.abs(todayPnl)).toFixed(2),
    canTrade: Math.abs(todayPnl) < maxDailyLoss,
    warning: Math.abs(todayPnl) >= maxDailyLoss ? 'Daily loss limit reached — stop trading today' : null,
  };
}
