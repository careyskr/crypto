import { calculateAllIndicators } from './indicators.js';
import { analyzeMTF } from './mtfAnalyzer.js';

const SIGNAL_TYPES = {
  STRONG_BUY: 'STRONG_BUY',
  BUY: 'BUY',
  NEUTRAL: 'NEUTRAL',
  SELL: 'SELL',
  STRONG_SELL: 'STRONG_SELL',
  NO_TRADE: 'NO_TRADE',
};

const MIN_CONFIDENCE = 75;
const MIN_TF_ALIGNMENT = 3;

/**
 * Advanced Signal Engine with strict confirmation
 * Returns NO_TRADE instead of weak signals
 */
export async function generateConfirmedSignal(symbol, klines, timeframe = '1h') {
  if (!klines || klines.length < 100) {
    return noTrade('Insufficient data for analysis');
  }

  // Step 1: Multi-timeframe analysis
  let mtf;
  try {
    mtf = await analyzeMTF(symbol, timeframe);
  } catch (err) {
    return noTrade(`MTF analysis failed: ${err.message}`);
  }

  // Step 2: Primary timeframe indicators
  const indicators = calculateAllIndicators(klines);
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);

  // Step 3: Run all confirmations
  const trendConfirm = confirmTrend(indicators, closes, mtf);
  const momentumConfirm = confirmMomentum(indicators, closes);
  const volumeConfirm = confirmVolume(indicators, volumes, klines);
  const structureConfirm = confirmStructure(klines, indicators, closes);
  const volatilityConfirm = confirmVolatility(indicators, closes);

  // Step 4: Aggregate confirmations
  const confirmations = {
    trend: trendConfirm,
    momentum: momentumConfirm,
    volume: volumeConfirm,
    structure: structureConfirm,
    volatility: volatilityConfirm,
  };

  // Count passed confirmations
  const passed = Object.values(confirmations).filter(c => c.passed).length;
  const total = Object.keys(confirmations).length;

  // Step 5: Determine signal direction
  const bullSignals = Object.values(confirmations).filter(c => c.direction === 'bullish').length;
  const bearSignals = Object.values(confirmations).filter(c => c.direction === 'bearish').length;

  // Step 6: Quality gate — must pass minimum requirements
  const qualityCheck = runQualityGate(confirmations, mtf, passed, bullSignals, bearSignals);

  if (!qualityCheck.passed) {
    return noTrade(qualityCheck.reason, {
      confirmations,
      mtf: mtf.alignment,
      qualityCheck,
    });
  }

  // Step 7: Determine signal type
  let signal;
  let confidence;

  if (bullSignals >= 4 && mtf.alignment.direction === 'bullish') {
    signal = passed >= 5 ? SIGNAL_TYPES.STRONG_BUY : SIGNAL_TYPES.BUY;
    confidence = Math.min(95, 60 + bullSignals * 5 + mtf.alignment.score * 0.2);
  } else if (bearSignals >= 4 && mtf.alignment.direction === 'bearish') {
    signal = passed >= 5 ? SIGNAL_TYPES.STRONG_SELL : SIGNAL_TYPES.SELL;
    confidence = Math.min(95, 60 + bearSignals * 5 + mtf.alignment.score * 0.2);
  } else if (bullSignals > bearSignals && mtf.alignment.direction === 'bullish') {
    signal = SIGNAL_TYPES.BUY;
    confidence = 55 + bullSignals * 4 + mtf.alignment.score * 0.15;
  } else if (bearSignals > bullSignals && mtf.alignment.direction === 'bearish') {
    signal = SIGNAL_TYPES.SELL;
    confidence = 55 + bearSignals * 4 + mtf.alignment.score * 0.15;
  } else {
    return noTrade('No clear directional bias across timeframes', {
      confirmations,
      mtf: mtf.alignment,
    });
  }

  // Step 8: Calculate risk/reward
  const isBuy = signal === SIGNAL_TYPES.STRONG_BUY || signal === SIGNAL_TYPES.BUY;
  const riskReward = calculateAdvancedRiskReward(klines, indicators, mtf, isBuy);

  // Step 9: Final confidence adjustment
  confidence = adjustConfidence(confidence, riskReward, mtf, volumeConfirm);

  // Step 10: Final quality gate — minimum confidence
  if (confidence < MIN_CONFIDENCE) {
    return noTrade(`Confidence ${confidence.toFixed(0)}% below minimum ${MIN_CONFIDENCE}%`, {
      confirmations,
      mtf: mtf.alignment,
      confidence: Math.round(confidence),
    });
  }

  // Step 11: Generate AI explanation
  const explanation = generateExplanation(signal, confirmations, mtf, riskReward, symbol);

  return {
    signal,
    confidence: Math.round(confidence),
    symbol,
    timeframe,
    confirmations: summarizeConfirmations(confirmations),
    passedConfirmations: `${passed}/${total}`,
    trendAlignment: `${mtf.alignment.bullCount}B/${mtf.alignment.bearCount}Br/${mtf.alignment.neutralCount}N`,
    marketStructure: mtf.timeframes[timeframe]?.structure?.structure || 'unknown',
    mtf: mtf.alignment,
    riskReward,
    indicators: extractIndicatorSummary(indicators),
    explanation,
    entryZone: riskReward.entryZone,
    stopLoss: riskReward.stopLoss,
    takeProfits: riskReward.takeProfits,
    timestamp: Date.now(),
  };
}

// ============ CONFIRMATION FUNCTIONS ============

function confirmTrend(indicators, closes, mtf) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const ema9 = getLatest(indicators.ema9);
  const ema20 = getLatest(indicators.ema20);
  const ema50 = getLatest(indicators.ema50);
  const sma200 = getLatest(indicators.sma200);
  const latest = closes[closes.length - 1];

  let bull = 0;
  let bear = 0;
  let reasons = [];

  // EMA stacking
  if (ema9 && ema20 && ema50) {
    if (latest > ema9 && ema9 > ema20 && ema20 > ema50) {
      bull += 3; reasons.push('EMA bullish stack');
    }
    if (latest < ema9 && ema9 < ema20 && ema20 < ema50) {
      bear += 3; reasons.push('EMA bearish stack');
    }
  }

  // SMA200
  if (sma200) {
    if (latest > sma200) { bull += 1; reasons.push('Above SMA200'); }
    else { bear += 1; reasons.push('Below SMA200'); }
  }

  // MTF alignment
  if (mtf.alignment.aligned) {
    if (mtf.alignment.direction === 'bullish') { bull += 2; reasons.push('MTF aligned bullish'); }
    if (mtf.alignment.direction === 'bearish') { bear += 2; reasons.push('MTF aligned bearish'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  const passed = Math.abs(bull - bear) >= 3;

  return { passed, direction, score: Math.abs(bull - bear), reasons, bull, bear };
}

function confirmMomentum(indicators, closes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const getPrev = (arr) => arr.length > 1 ? arr[arr.length - 2].value : null;

  const rsi = getLatest(indicators.rsi);
  const macd = getLatest(indicators.macd);
  const macdSignal = getLatest(indicators.macdSignal);
  const macdHist = getLatest(indicators.macdHist);
  const stochK = getLatest(indicators.stochK);
  const stochD = getLatest(indicators.stochD);
  const adx = getLatest(indicators.adx);
  const adxPlus = getLatest(indicators.adxPlus);
  const adxMinus = getLatest(indicators.adxMinus);

  let bull = 0;
  let bear = 0;
  let reasons = [];

  // RSI
  if (rsi !== null) {
    if (rsi > 50 && rsi < 75) { bull += 2; reasons.push(`RSI ${rsi.toFixed(0)} bullish`); }
    if (rsi < 50 && rsi > 25) { bear += 2; reasons.push(`RSI ${rsi.toFixed(0)} bearish`); }
    if (rsi > 70) { bear += 1; reasons.push(`RSI ${rsi.toFixed(0)} overbought`); }
    if (rsi < 30) { bull += 1; reasons.push(`RSI ${rsi.toFixed(0)} oversold`); }
  }

  // MACD
  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal) { bull += 2; reasons.push('MACD above signal'); }
    if (macd < macdSignal) { bear += 2; reasons.push('MACD below signal'); }
    if (macdHist > 0) { bull += 1; reasons.push('MACD histogram positive'); }
    if (macdHist < 0) { bear += 1; reasons.push('MACD histogram negative'); }

    const prevMacd = getPrev(indicators.macd);
    const prevSignal = getPrev(indicators.macdSignal);
    if (prevMacd && prevSignal) {
      if (prevMacd < prevSignal && macd > macdSignal) { bull += 3; reasons.push('MACD crossover'); }
      if (prevMacd > prevSignal && macd < macdSignal) { bear += 3; reasons.push('MACD crossunder'); }
    }
  }

  // Stochastic
  if (stochK !== null && stochD !== null) {
    if (stochK > stochD && stochK < 80) { bull += 1; reasons.push('Stoch bullish'); }
    if (stochK < stochD && stochK > 20) { bear += 1; reasons.push('Stoch bearish'); }
  }

  // ADX
  if (adx !== null && adxPlus !== null && adxMinus !== null) {
    if (adx > 25 && adxPlus > adxMinus) { bull += 2; reasons.push(`ADX ${adx.toFixed(0)} +DI dominant`); }
    if (adx > 25 && adxMinus > adxPlus) { bear += 2; reasons.push(`ADX ${adx.toFixed(0)} -DI dominant`); }
    if (adx > 40) { reasons.push('Strong trend detected'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  const passed = Math.abs(bull - bear) >= 4;

  return { passed, direction, score: Math.abs(bull - bear), reasons, bull, bear };
}

function confirmVolume(indicators, volumes, klines) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const volSma = getLatest(indicators.volumeSma);
  const obv = indicators.obv;
  const latestVol = volumes[volumes.length - 1];
  const closes = klines.map(k => k.close);
  const latestClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  let bull = 0;
  let bear = 0;
  let reasons = [];

  // Volume relative to average
  if (volSma && latestVol) {
    const ratio = latestVol / volSma;
    if (ratio > 1.5) {
      if (latestClose > prevClose) { bull += 3; reasons.push(`High volume (${ratio.toFixed(1)}x) with price up`); }
      else { bear += 3; reasons.push(`High volume (${ratio.toFixed(1)}x) with price down`); }
    } else if (ratio > 1.0) {
      if (latestClose > prevClose) { bull += 1; reasons.push('Above avg volume + up'); }
      else { bear += 1; reasons.push('Above avg volume + down'); }
    } else {
      reasons.push('Low volume — weak move');
    }
  }

  // OBV trend
  if (obv.length >= 10) {
    const recent = obv.slice(-10).map(d => d.value);
    const slope = recent[9] - recent[0];
    if (slope > 0) { bull += 1; reasons.push('OBV accumulation'); }
    if (slope < 0) { bear += 1; reasons.push('OBV distribution'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  const passed = Math.abs(bull - bear) >= 1 || (volSma && latestVol / volSma > 1.3);

  return { passed, direction, score: Math.abs(bull - bear), reasons, bull, bear };
}

function confirmStructure(klines, indicators, closes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const bbUpper = getLatest(indicators.bbUpper);
  const bbLower = getLatest(indicators.bbLower);
  const bbMiddle = getLatest(indicators.bbMiddle);
  const latest = closes[closes.length - 1];

  // Detect recent swing points
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const len = closes.length;

  let bull = 0;
  let bear = 0;
  let reasons = [];

  // Simple structure: HH/HL or LH/LL
  const lookback = Math.min(30, len);
  const recentCloses = closes.slice(-lookback);
  const mid = Math.floor(lookback / 2);
  const firstHalfHigh = Math.max(...recentCloses.slice(0, mid));
  const secondHalfHigh = Math.max(...recentCloses.slice(mid));
  const firstHalfLow = Math.min(...recentCloses.slice(0, mid));
  const secondHalfLow = Math.min(...recentCloses.slice(mid));

  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) {
    bull += 3; reasons.push('Higher highs + higher lows');
  } else if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) {
    bear += 3; reasons.push('Lower highs + lower lows');
  }

  // Breakout detection
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));

  if (latest >= recentHigh * 0.998) {
    bull += 2; reasons.push('Near breakout high');
  }
  if (latest <= recentLow * 1.002) {
    bear += 2; reasons.push('Near breakdown low');
  }

  // BB position
  if (bbUpper && bbLower && bbMiddle) {
    if (latest > bbMiddle && latest < bbUpper) { bull += 1; reasons.push('Upper BB channel'); }
    if (latest < bbMiddle && latest > bbLower) { bear += 1; reasons.push('Lower BB channel'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  const passed = Math.abs(bull - bear) >= 2;

  return { passed, direction, score: Math.abs(bull - bear), reasons, bull, bear };
}

function confirmVolatility(indicators, closes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const atr = getLatest(indicators.atr);
  const latest = closes[closes.length - 1];

  let reasons = [];
  let passed = true;

  if (atr && latest) {
    const atrPercent = (atr / latest) * 100;
    if (atrPercent < 0.5) {
      passed = false;
      reasons.push(`Low volatility (${atrPercent.toFixed(2)}%) — choppy market`);
    } else if (atrPercent > 8) {
      reasons.push(`Extreme volatility (${atrPercent.toFixed(2)}%) — high risk`);
    } else {
      reasons.push(`Healthy volatility (${atrPercent.toFixed(2)}%)`);
    }
  }

  return { passed, direction: 'neutral', score: 0, reasons, bull: 0, bear: 0 };
}

// ============ QUALITY GATE ============

function runQualityGate(confirmations, mtf, passed, bullSignals, bearSignals) {
  const reasons = [];

  // Check MTF alignment
  if (mtf.alignment.totalValid >= 3) {
    if (mtf.alignment.bullCount < MIN_TF_ALIGNMENT && mtf.alignment.bearCount < MIN_TF_ALIGNMENT) {
      reasons.push(`TF alignment ${mtf.alignment.bullCount}B/${mtf.alignment.bearCount}Br — need ${MIN_TF_ALIGNMENT} minimum`);
    }
  }

  // Check volume confirmation
  if (!confirmations.volume.passed) {
    reasons.push('Volume not confirmed');
  }

  // Check trend confirmation
  if (!confirmations.trend.passed) {
    reasons.push('Trend not confirmed');
  }

  // Must have at least 3 confirmations
  if (passed < 3) {
    reasons.push(`Only ${passed}/5 confirmations — need 3 minimum`);
  }

  // Must have clear directional bias
  if (bullSignals < 3 && bearSignals < 3) {
    reasons.push('No clear directional bias');
  }

  return {
    passed: reasons.length === 0,
    reason: reasons.join('; ') || 'All quality gates passed',
    reasons,
  };
}

// ============ RISK/REWARD CALCULATION ============

function calculateAdvancedRiskReward(klines, indicators, mtf, isBuy) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const latest = closes[closes.length - 1];
  const atr = getLatest(indicators.atr) || latest * 0.02;

  // Find key S/R levels
  const lookback = Math.min(50, closes.length);
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  const resistance = Math.max(...recentHighs);
  const support = Math.min(...recentLows);

  let entryZone, sl, tp1, tp2, tp3;

  if (isBuy) {
    // Entry: current price zone
    entryZone = {
      low: +(latest - atr * 0.3).toFixed(8),
      high: +(latest + atr * 0.3).toFixed(8),
      optimal: +latest.toFixed(8),
    };

    // SL: below recent structure or ATR-based
    const structureSL = Math.min(...recentLows.slice(-10));
    sl = +Math.max(structureSL - atr * 0.2, latest - atr * 2).toFixed(8);

    // TPs based on R:R
    const risk = latest - sl;
    tp1 = +(latest + risk * 1.5).toFixed(8);  // 1:1.5
    tp2 = +(latest + risk * 2.5).toFixed(8);  // 1:2.5
    tp3 = +(latest + risk * 4).toFixed(8);    // 1:4
  } else {
    entryZone = {
      low: +(latest - atr * 0.3).toFixed(8),
      high: +(latest + atr * 0.3).toFixed(8),
      optimal: +latest.toFixed(8),
    };

    const structureSL = Math.max(...recentHighs.slice(-10));
    sl = +Math.min(structureSL + atr * 0.2, latest + atr * 2).toFixed(8);

    const risk = sl - latest;
    tp1 = +(latest - risk * 1.5).toFixed(8);
    tp2 = +(latest - risk * 2.5).toFixed(8);
    tp3 = +(latest - risk * 4).toFixed(8);
  }

  const risk = Math.abs(entryZone.optimal - sl);
  const reward = Math.abs(tp2 - entryZone.optimal);
  const rrRatio = risk > 0 ? +(reward / risk).toFixed(2) : 0;

  return {
    entryZone,
    stopLoss: sl,
    takeProfits: { tp1, tp2, tp3 },
    rrRatio,
    atrValue: +atr.toFixed(8),
    riskPercent: +((risk / latest) * 100).toFixed(2),
  };
}

function adjustConfidence(baseConfidence, riskReward, mtf, volumeConfirm) {
  let adj = baseConfidence;

  // R:R bonus/penalty
  if (riskReward.rrRatio >= 3) adj += 5;
  if (riskReward.rrRatio >= 4) adj += 5;
  if (riskReward.rrRatio < 2) adj -= 10;
  if (riskReward.rrRatio < 1.5) adj -= 10;

  // MTF alignment bonus
  if (mtf.alignment.aligned) adj += 5;
  if (mtf.alignment.score >= 80) adj += 5;

  // Volume bonus
  if (volumeConfirm.passed && volumeConfirm.score >= 3) adj += 5;

  return Math.max(0, Math.min(95, adj));
}

// ============ EXPLANATION GENERATOR ============

function generateExplanation(signal, confirmations, mtf, riskReward, symbol) {
  const isBuy = signal.includes('BUY');
  const direction = isBuy ? 'bullish' : 'bearish';
  const action = isBuy ? 'LONG' : 'SHORT';

  const trendReasons = confirmations.trend.reasons.slice(0, 2).join(', ');
  const momentumReasons = confirmations.momentum.reasons.slice(0, 2).join(', ');
  const volumeReasons = confirmations.volume.reasons.slice(0, 1).join(', ');
  const structureReasons = confirmations.structure.reasons.slice(0, 1).join(', ');

  const tfDetail = Object.entries(mtf.alignment.details)
    .map(([tf, dir]) => `${tf}:${dir}`)
    .join(', ');

  return `${symbol} shows a ${direction} setup on ${action}. ` +
    `Trend: ${trendReasons}. ` +
    `Momentum: ${momentumReasons}. ` +
    `Volume: ${volumeReasons}. ` +
    `Structure: ${structureReasons}. ` +
    `Multi-timeframe alignment: ${tfDetail} (${mtf.alignment.bullCount}B/${mtf.alignment.bearCount}Br). ` +
    `Risk/Reward: ${riskReward.rrRatio}:1 with ${riskReward.riskPercent}% risk. ` +
    `Entry zone: ${riskReward.entryZone.low} - ${riskReward.entryZone.high}.`;
}

// ============ HELPERS ============

function noTrade(reason, extra = {}) {
  return {
    signal: SIGNAL_TYPES.NO_TRADE,
    confidence: 0,
    reason,
    timestamp: Date.now(),
    ...extra,
  };
}

function summarizeConfirmations(confirmations) {
  const summary = {};
  for (const [key, val] of Object.entries(confirmations)) {
    summary[key] = {
      passed: val.passed,
      direction: val.direction,
      score: val.score,
      topReason: val.reasons[0] || 'N/A',
    };
  }
  return summary;
}

function extractIndicatorSummary(indicators) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  return {
    rsi: getLatest(indicators.rsi) ? +getLatest(indicators.rsi).toFixed(2) : null,
    macd: getLatest(indicators.macd) ? +getLatest(indicators.macd).toFixed(6) : null,
    adx: getLatest(indicators.adx) ? +getLatest(indicators.adx).toFixed(2) : null,
    ema9: getLatest(indicators.ema9) ? +getLatest(indicators.ema9).toFixed(8) : null,
    ema20: getLatest(indicators.ema20) ? +getLatest(indicators.ema20).toFixed(8) : null,
    ema50: getLatest(indicators.ema50) ? +getLatest(indicators.ema50).toFixed(8) : null,
    atr: getLatest(indicators.atr) ? +getLatest(indicators.atr).toFixed(8) : null,
  };
}
