import { BinanceRestService } from './binanceRest.js';
import { BybitRestService } from './bybitRest.js';
import { OkxRestService } from './okxRest.js';
import { KucoinRestService } from './kucoinRest.js';
import { CoinbaseRestService } from './coinbaseRest.js';
import { KrakenRestService } from './krakenRest.js';
import { calculateAllIndicators } from './indicators.js';
import { analyzeMTF } from './mtfAnalyzer.js';

const restServices = {
  binance: new BinanceRestService(),
  bybit: new BybitRestService(),
  okx: new OkxRestService(),
  kucoin: new KucoinRestService(),
  coinbase: new CoinbaseRestService(),
  kraken: new KrakenRestService(),
};

const DEFAULT_PREFS = {
  tradingMode: 'intraday',
  riskLevel: 'moderate',
  timeframe: '1h',
  direction: 'both',
  exchange: 'binance',
  marketType: 'spot',
};

const MODE_TIMEFRAMES = {
  scalping: ['1m', '5m', '15m'],
  intraday: ['15m', '1h', '4h'],
  swing: ['4h', '1d', '1w'],
  spot: ['1h', '4h', '1d'],
  futures: ['15m', '1h', '4h'],
};

const RISK_CONFIDENCE = {
  safe: 80,
  moderate: 65,
  aggressive: 50,
};

const RISK_LEVERAGE = {
  safe: 3,
  moderate: 5,
  aggressive: 10,
};

/**
 * Main scanner: scan exchanges and rank opportunities with full ranking data
 * Returns: top coins ranked by opportunity score with trendStrength, volumeStrength, volatility, risk level, AI confidence
 */
export async function scanWithPreferences(prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const minConfidence = RISK_CONFIDENCE[p.riskLevel] || 65;

  const symbols = await fetchTopSymbols(p.exchange, p.limit || 60);
  const results = [];
  const batchSize = 3;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(sym => analyzeSymbol(sym, p))
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
  }

  let filtered = results;
  if (p.direction === 'long') {
    filtered = filtered.filter(r => r.trend === 'bullish');
  } else if (p.direction === 'short') {
    filtered = filtered.filter(r => r.trend === 'bearish');
  }

  filtered = filtered.filter(r => r.opportunityScore >= minConfidence);

  // Smart filtering: remove weak setups
  filtered = filtered.filter(r => {
    if (r.volumeStrength < 0.3) return false;
    if (r.volatility < 0.3) return false;
    if (r.trendStrength < 20 && r.opportunityScore < 70) return false;
    if (r.riskLevel === 'high' && p.riskLevel === 'safe') return false;
    return true;
  });

  filtered.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const top = filtered.slice(0, 15);

  return {
    scanned: symbols.length,
    qualified: top.length,
    preferences: p,
    minConfidence,
    results: top,
    timestamp: Date.now(),
  };
}

/**
 * Generate a full smart signal for a specific symbol with user preferences
 * Follows spec: includes coin pair, exchange, LONG/SHORT, entry zone, TP1/TP2/TP3, SL, confidence, risk level, suggested leverage, trade style, timeframe, AI reasoning
 */
export async function generateSmartSignal(symbol, prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const tf = p.timeframe || '1h';

  const klines = await fetchKlines(p.exchange, symbol, tf, 500);
  if (!klines || klines.length < 100) {
    return noTrade('Insufficient data for analysis', symbol, p);
  }

  const indicators = calculateAllIndicators(klines);
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);

  let mtf;
  try {
    mtf = await analyzeMTF(symbol, tf);
  } catch {
    mtf = { alignment: { direction: 'neutral', aligned: false, bullCount: 0, bearCount: 0, score: 0, details: {} } };
  }

  const confirmations = {
    trend: confirmTrend(indicators, closes, mtf),
    momentum: confirmMomentum(indicators, closes),
    volume: confirmVolume(indicators, volumes, klines),
    structure: confirmStructure(klines, indicators, closes),
    volatility: confirmVolatility(indicators, closes),
    sentiment: confirmSentiment(indicators, closes, volumes),
  };

  const passed = Object.values(confirmations).filter(c => c.passed).length;
  const total = Object.keys(confirmations).length;
  const bullSignals = Object.values(confirmations).filter(c => c.direction === 'bullish').length;
  const bearSignals = Object.values(confirmations).filter(c => c.direction === 'bearish').length;

  const minConfidence = RISK_CONFIDENCE[p.riskLevel] || 65;
  const minConfirmations = p.riskLevel === 'safe' ? 3 : 2;

  // Direction filter
  if (p.direction === 'long' && bearSignals > bullSignals) {
    return noTrade('User preference: Long only, but market bias is bearish', symbol, p, confirmations, mtf);
  }
  if (p.direction === 'short' && bullSignals > bearSignals) {
    return noTrade('User preference: Short only, but market bias is bullish', symbol, p, confirmations, mtf);
  }

  // Market type validation — SPOT only allows LONG positions
  if (p.marketType === 'spot') {
    if (bearSignals > bullSignals) {
      return noTrade('No safe SPOT long opportunity currently available. Market condition is bearish, unsuitable for spot buying.', symbol, p, confirmations, mtf);
    }
    // Force LONG direction for spot
    if (!(bullSignals > bearSignals)) {
      return noTrade('No safe SPOT long opportunity currently available. No clear bullish setup detected for spot trading.', symbol, p, confirmations, mtf);
    }
  }

  // Smart filtering - must pass minimum confirmations
  if (passed < minConfirmations) {
    return noTrade(`Only ${passed}/${total} confirmations passed (need ${minConfirmations}). No safe setup found.`, symbol, p, confirmations, mtf);
  }

  // Quality check
  const qualityCheck = runQualityGate(confirmations, mtf, passed, bullSignals, bearSignals, p);
  if (!qualityCheck.passed) {
    return noTrade(qualityCheck.reason, symbol, p, confirmations, mtf);
  }

  let signal, confidence;
  const isBuy = bullSignals > bearSignals;

  if (bullSignals >= 4 && mtf.alignment.direction === 'bullish') {
    signal = passed >= 5 ? 'STRONG_BUY' : 'BUY';
    confidence = Math.min(95, 60 + bullSignals * 5 + mtf.alignment.score * 0.2);
  } else if (bearSignals >= 4 && mtf.alignment.direction === 'bearish') {
    signal = passed >= 5 ? 'STRONG_SELL' : 'SELL';
    confidence = Math.min(95, 60 + bearSignals * 5 + mtf.alignment.score * 0.2);
  } else if (bullSignals > bearSignals) {
    signal = 'BUY';
    confidence = 55 + bullSignals * 4;
  } else if (bearSignals > bullSignals) {
    signal = 'SELL';
    confidence = 55 + bearSignals * 4;
  } else {
    return noTrade('No clear directional bias. No safe high-confidence setup currently available.', symbol, p, confirmations, mtf);
  }

  const riskReward = calculateRiskReward(klines, indicators, isBuy);

  confidence = adjustConfidence(confidence, riskReward, mtf, confirmations);

  if (confidence < minConfidence) {
    return noTrade(`Confidence ${confidence.toFixed(0)}% below ${minConfidence}% threshold. No safe high-confidence setup currently available.`, symbol, p, confirmations, mtf);
  }

  const suggestedLeverage = p.marketType === 'spot'
    ? 1
    : Math.min(
        RISK_LEVERAGE[p.riskLevel] || 5,
        Math.max(1, Math.floor(100 / riskReward.riskPercent))
      );

  const explanation = buildExplanation(symbol, signal, confirmations, mtf, riskReward, p);

  // AI trade type suggestion
  const tradeSuggestion = recommendTradeType(confirmations, mtf, riskReward, p);

  // Spec-required fields
  return {
    signal,
    confidence: Math.round(confidence),
    symbol,
    exchange: p.exchange,
    direction: isBuy ? 'LONG' : 'SHORT',
    recommendedTradeType: tradeSuggestion.type,
    tradeSuggestion,
    entryZone: riskReward.entryZone,
    takeProfits: riskReward.takeProfits,
    stopLoss: riskReward.stopLoss,
    riskLevel: p.riskLevel,
    suggestedLeverage,
    tradingMode: p.tradingMode,
    timeframe: tf,
    rrRatio: riskReward.rrRatio,
    riskPercent: riskReward.riskPercent,
    confirmations: summarizeConfirmations(confirmations),
    passedConfirmations: `${passed}/${total}`,
    mtf: mtf.alignment,
    indicators: extractIndicators(indicators),
    explanation,
    marketRegime: mtf.alignment.direction,
    trendStrength: calculateTrendStrength(confirmations),
    volumeStrength: calculateVolumeStrength(confirmations),
    volatility: riskReward.riskPercent,
    timestamp: Date.now(),
  };
}

// ============ ANALYZE COIN (Full Technical Analysis) ============

export async function analyzeCoin(symbol, prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const tf = p.timeframe || '1h';

  const klines = await fetchKlines(p.exchange, symbol, tf, 500);
  if (!klines || klines.length < 100) {
    return { error: 'Insufficient data for analysis', symbol };
  }

  const indicators = calculateAllIndicators(klines);
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  const latest = closes[closes.length - 1];

  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const getPrev = (arr) => arr.length > 1 ? arr[arr.length - 2].value : null;

  // Trend analysis
  const ema9 = getLatest(indicators.ema9);
  const ema20 = getLatest(indicators.ema20);
  const ema50 = getLatest(indicators.ema50);
  const sma200 = getLatest(indicators.sma200);

  let trendDirection = 'neutral';
  let trendStrength = 0;
  if (ema9 && ema20 && ema50) {
    if (latest > ema9 && ema9 > ema20 && ema20 > ema50) { trendDirection = 'bullish'; trendStrength = 85; }
    else if (latest < ema9 && ema9 < ema20 && ema20 < ema50) { trendDirection = 'bearish'; trendStrength = 85; }
    else if (latest > ema9) { trendDirection = 'bullish'; trendStrength = 55; }
    else if (latest < ema9) { trendDirection = 'bearish'; trendStrength = 55; }
  }

  // RSI analysis
  const rsi = getLatest(indicators.rsi);
  let rsiCondition = 'neutral';
  if (rsi !== null) {
    if (rsi < 30) rsiCondition = 'oversold';
    else if (rsi < 45) rsiCondition = 'bearish';
    else if (rsi > 70) rsiCondition = 'overbought';
    else if (rsi > 55) rsiCondition = 'bullish';
  }

  // MACD analysis
  const macd = getLatest(indicators.macd);
  const macdSignal = getLatest(indicators.macdSignal);
  const macdHist = getLatest(indicators.macdHist);
  const prevMacd = getPrev(indicators.macd);
  const prevSignal = getPrev(indicators.macdSignal);

  let macdCondition = 'neutral';
  let macdCrossover = false;
  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal && macdHist > 0) macdCondition = 'bullish';
    else if (macd < macdSignal && macdHist < 0) macdCondition = 'bearish';
    if (prevMacd !== null && prevSignal !== null) {
      if (prevMacd < prevSignal && macd > macdSignal) macdCrossover = true;
      if (prevMacd > prevSignal && macd < macdSignal) macdCrossover = true;
    }
  }

  // ADX
  const adx = getLatest(indicators.adx);
  const adxPlus = getLatest(indicators.adxPlus);
  const adxMinus = getLatest(indicators.adxMinus);
  let adxCondition = 'weak';
  if (adx !== null) {
    if (adx > 40) adxCondition = 'strong';
    else if (adx > 25) adxCondition = 'trending';
    else if (adx > 20) adxCondition = 'developing';
  }

  // Bollinger Bands
  const bbUpper = getLatest(indicators.bbUpper);
  const bbLower = getLatest(indicators.bbLower);
  const bbMiddle = getLatest(indicators.bbMiddle);
  let bbCondition = 'neutral';
  if (bbUpper && bbLower && bbMiddle) {
    if (latest > bbUpper) bbCondition = 'above_upper';
    else if (latest < bbLower) bbCondition = 'below_lower';
    else if (latest > bbMiddle) bbCondition = 'upper_half';
    else if (latest < bbMiddle) bbCondition = 'lower_half';
  }

  // Stochastic
  const stochK = getLatest(indicators.stochK);
  const stochD = getLatest(indicators.stochD);
  let stochCondition = 'neutral';
  if (stochK !== null && stochD !== null) {
    if (stochK > 80 && stochD > 80) stochCondition = 'overbought';
    else if (stochK < 20 && stochD < 20) stochCondition = 'oversold';
    else if (stochK > stochD) stochCondition = 'bullish';
    else if (stochK < stochD) stochCondition = 'bearish';
  }

  // Volume analysis
  const volumeSma = getLatest(indicators.volumeSma);
  const latestVol = volumes[volumes.length - 1];
  let volCondition = 'normal';
  let volRatio = 1;
  if (volumeSma && latestVol) {
    volRatio = +(latestVol / volumeSma).toFixed(2);
    if (volRatio > 2) volCondition = 'surge';
    else if (volRatio > 1.5) volCondition = 'elevated';
    else if (volRatio < 0.5) volCondition = 'low';
  }

  // ATR / Volatility
  const atr = getLatest(indicators.atr);
  let volatility = 'low';
  let atrPercent = 0;
  if (atr && latest) {
    atrPercent = +((atr / latest) * 100).toFixed(2);
    if (atrPercent > 5) volatility = 'high';
    else if (atrPercent > 2) volatility = 'moderate';
    else if (atrPercent > 1) volatility = 'low';
    else volatility = 'very_low';
  }

  // Sentiment (simplified: combine RSI + MACD + volume + trend)
  const bullishSignals = [trendDirection === 'bullish', rsiCondition === 'bullish', macdCondition === 'bullish', volCondition !== 'low', stochCondition === 'bullish'].filter(Boolean).length;
  const bearishSignals = [trendDirection === 'bearish', rsiCondition === 'bearish', macdCondition === 'bearish', stochCondition === 'bearish'].filter(Boolean).length;
  let sentiment = 'neutral';
  let sentimentScore = 0;
  if (bullishSignals > bearishSignals + 1) { sentiment = 'bullish'; sentimentScore = Math.min(100, bullishSignals * 20); }
  else if (bearishSignals > bullishSignals + 1) { sentiment = 'bearish'; sentimentScore = Math.min(100, bearishSignals * 25); }

  // OBV
  const obv = indicators.obv;
  let obvCondition = 'neutral';
  if (obv && obv.length >= 5) {
    const recentObv = obv.slice(-5).map(d => d.value);
    const obvSlope = (recentObv[recentObv.length - 1] - recentObv[0]) / Math.abs(recentObv[0] || 1);
    if (obvSlope > 0.03) obvCondition = 'rising';
    else if (obvSlope < -0.03) obvCondition = 'falling';
  }

  // Multi-timeframe alignment
  let mtfAnalysis;
  try {
    mtfAnalysis = await analyzeMTF(symbol, tf);
  } catch {
    mtfAnalysis = null;
  }

  // Support/Resistance from structure
  const structure = (() => {
    const recentHighs = [];
    const recentLows = [];
    for (let i = 2; i < highs.length - 2; i++) {
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        recentHighs.push({ price: highs[i], index: i });
      }
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        recentLows.push({ price: lows[i], index: i });
      }
    }
    const swingHighs = recentHighs.slice(-3);
    const swingLows = recentLows.slice(-3);
    const keyLevels = [];
    for (const sh of swingHighs) {
      const dist = Math.abs(latest - sh.price) / latest;
      if (dist < 0.05) keyLevels.push({ type: 'resistance', price: sh.price, distance: +(dist * 100).toFixed(2) });
    }
    for (const sl of swingLows) {
      const dist = Math.abs(latest - sl.price) / latest;
      if (dist < 0.05) keyLevels.push({ type: 'support', price: sl.price, distance: +(dist * 100).toFixed(2) });
    }
    let breakout = null;
    if (swingHighs.length > 0 && latest > swingHighs[swingHighs.length - 1].price) breakout = { type: 'bullish', level: swingHighs[swingHighs.length - 1].price };
    if (swingLows.length > 0 && latest < swingLows[swingLows.length - 1].price) breakout = { type: 'bearish', level: swingLows[swingLows.length - 1].price };
    let struct = 'ranging';
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const hh = swingHighs[swingHighs.length-1].price > swingHighs[swingHighs.length-2].price;
      const hl = swingLows[swingLows.length-1].price > swingLows[swingLows.length-2].price;
      const lh = swingHighs[swingHighs.length-1].price < swingHighs[swingHighs.length-2].price;
      const ll = swingLows[swingLows.length-1].price < swingLows[swingLows.length-2].price;
      if (hh && hl) struct = 'uptrend';
      else if (lh && ll) struct = 'downtrend';
    }
    return { structure: struct, keyLevels, breakout };
  })();

  return {
    symbol,
    exchange: p.exchange,
    timeframe: tf,
    price: latest,
    trend: { direction: trendDirection, strength: trendStrength, ema9, ema20, ema50, sma200 },
    rsi: { value: rsi ? +rsi.toFixed(2) : null, condition: rsiCondition },
    macd: {
      macd: macd ? +macd.toFixed(6) : null,
      signal: macdSignal ? +macdSignal.toFixed(6) : null,
      histogram: macdHist ? +macdHist.toFixed(6) : null,
      condition: macdCondition,
      crossover: macdCrossover,
    },
    adx: { value: adx ? +adx.toFixed(2) : null, condition: adxCondition, plusDI: adxPlus ? +adxPlus.toFixed(2) : null, minusDI: adxMinus ? +adxMinus.toFixed(2) : null },
    bollinger: { upper: bbUpper, middle: bbMiddle, lower: bbLower, condition: bbCondition },
    stochastic: { k: stochK ? +stochK.toFixed(2) : null, d: stochD ? +stochD.toFixed(2) : null, condition: stochCondition },
    volume: { current: latestVol, sma: volumeSma, ratio: volRatio, condition: volCondition },
    volatility: { atr, atrPercent, level: volatility },
    sentiment: { direction: sentiment, score: sentimentScore, bullishSignals, bearishSignals },
    obv: { condition: obvCondition },
    structure: structure.structure,
    keyLevels: structure.keyLevels,
    breakout: structure.breakout,
    mtf: mtfAnalysis ? mtfAnalysis.alignment : null,
    timestamp: Date.now(),
  };
}

// ============ FIND TRADE (Check if safe setup exists) ============

export async function findTrade(symbol, prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const tf = p.timeframe || '1h';

  const klines = await fetchKlines(p.exchange, symbol, tf, 500);
  if (!klines || klines.length < 100) {
    return { found: false, message: 'Insufficient data for analysis', symbol, reasons: ['Not enough market data'] };
  }

  const indicators = calculateAllIndicators(klines);
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);

  let mtf;
  try {
    mtf = await analyzeMTF(symbol, tf);
  } catch {
    mtf = { alignment: { direction: 'neutral', aligned: false, bullCount: 0, bearCount: 0, score: 0, details: {} } };
  }

  const confirmations = {
    trend: confirmTrend(indicators, closes, mtf),
    momentum: confirmMomentum(indicators, closes),
    volume: confirmVolume(indicators, volumes, klines),
    structure: confirmStructure(klines, indicators, closes),
    volatility: confirmVolatility(indicators, closes),
    sentiment: confirmSentiment(indicators, closes, volumes),
  };

  const passed = Object.values(confirmations).filter(c => c.passed).length;
  const total = Object.keys(confirmations).length;
  const bullSignals = Object.values(confirmations).filter(c => c.direction === 'bullish').length;
  const bearSignals = Object.values(confirmations).filter(c => c.direction === 'bearish').length;

  const minConfidence = RISK_CONFIDENCE[p.riskLevel] || 65;
  const minConfirmations = p.riskLevel === 'safe' ? 3 : 2;

  // Check all conditions
  const issues = [];

  if (p.direction === 'long' && bearSignals > bullSignals) {
    issues.push('User prefers long but market bias is bearish');
  }
  if (p.direction === 'short' && bullSignals > bearSignals) {
    issues.push('User prefers short but market bias is bullish');
  }

  // Market type validation — SPOT only allows LONG positions
  if (p.marketType === 'spot') {
    if (bearSignals > bullSignals) {
      issues.push('No safe SPOT long opportunity. Market is bearish, unsuitable for spot buying.');
    } else if (!(bullSignals > bearSignals)) {
      issues.push('No safe SPOT long opportunity. No clear bullish setup detected.');
    }
  }

  if (passed < minConfirmations) {
    issues.push(`Only ${passed}/${total} confirmations passed (need ${minConfirmations})`);
  }

  // Quality gate
  const qualityCheck = runQualityGate(confirmations, mtf, passed, bullSignals, bearSignals, p);
  if (!qualityCheck.passed) {
    issues.push(qualityCheck.reason);
  }

  // Check for clear directional bias
  const noClearBias = bullSignals === bearSignals || (bullSignals <= 2 && bearSignals <= 2);
  if (noClearBias) {
    issues.push('No clear directional bias');
  }

  if (issues.length > 0) {
    return {
      found: false,
      message: 'No safe high-confidence setup currently available.',
      symbol,
      exchange: p.exchange,
      timeframe: tf,
      reasons: issues,
      confirmations: summarizeConfirmations(confirmations),
      mtf: mtf.alignment,
      trends: { bullSignals, bearSignals, passed, total },
      timestamp: Date.now(),
    };
  }

  // Trade opportunity found
  const isBuy = bullSignals > bearSignals;
  const riskReward = calculateRiskReward(klines, indicators, isBuy);
  const confidence = adjustConfidence(60 + bullSignals * 5, riskReward, mtf, confirmations);

  // Suggest trade type based on conditions
  const tradeSuggestion = recommendTradeType(confirmations, mtf, riskReward, p);

  return {
    found: true,
    message: 'Trade Opportunity Found',
    symbol,
    exchange: p.exchange,
    timeframe: tf,
    direction: isBuy ? 'LONG' : 'SHORT',
    confidence: Math.round(confidence),
    tradeSuggestion,
    entry: riskReward.entryZone,
    takeProfits: riskReward.takeProfits,
    stopLoss: riskReward.stopLoss,
    rrRatio: riskReward.rrRatio,
    riskPercent: riskReward.riskPercent,
    confirmations: summarizeConfirmations(confirmations),
    passedConfirmations: `${passed}/${total}`,
    mtf: mtf.alignment,
    reasons: buildFindTradeReasons(symbol, confirmations, mtf, isBuy),
    timestamp: Date.now(),
    nextStep: 'Generate AI Signal or View Analysis',
  };
}

// ============ AI TRADE TYPE SUGGESTION (Spot / Futures / Avoid) ============

export function recommendTradeType(confirmations, mtf, riskReward, prefs = {}) {
  const trend = confirmations.trend;
  const momentum = confirmations.momentum;
  const volume = confirmations.volume;
  const volatility = confirmations.volatility;
  const userMarketType = prefs.marketType || 'spot';

  const trendScore = trend?.score || 0;
  const momentumScore = momentum?.score || 0;
  const volumeScore = volume?.score || 0;
  const rr = riskReward?.rrRatio || 0;
  const riskPct = riskReward?.riskPercent || 2;
  const mtfAligned = mtf?.alignment?.aligned || false;
  const mtfDirection = mtf?.alignment?.direction || 'neutral';
  const volHigh = volumeScore >= 3;
  const trendStrong = trendScore >= 4;
  const momentumStrong = momentumScore >= 3;

  // Respect user's market type preference
  // SPOT mode: must not suggest futures
  if (userMarketType === 'spot') {
    const spotConditions = [
      riskPct < 3,
      rr >= 1.5,
      mtfDirection !== 'neutral',
      trendScore >= 2,
      momentumScore >= 2,
    ];
    const spotScore = spotConditions.filter(Boolean).length;

    if (spotScore >= 3) {
      const reasons = [];
      if (riskPct < 3) reasons.push('controlled risk');
      if (rr >= 1.5) reasons.push('favorable risk/reward');
      if (trendScore >= 2) reasons.push('trend confirmation');
      return {
        type: 'spot',
        confidence: Math.min(90, 50 + spotScore * 10),
        reasoning: `AI recommends SPOT trading because market conditions are stable with ${reasons.join(', ')} and lower liquidation risk.`,
        suggestedLeverage: 1,
        riskWarning: 'Spot trading has no liquidation risk. Secure long-term position.',
      };
    }

    return {
      type: 'avoid',
      confidence: 0,
      reasoning: `No safe SPOT opportunity. Conditions are not favorable for spot buying at this time.`,
      suggestedLeverage: 1,
      riskWarning: 'Spot buying conditions not met. Wait for better bullish setup.',
    };
  }

  // FUTURES mode: evaluate both futures and spot
  // FUTURES conditions: strong momentum, confirmed breakout, high trend alignment, volume expansion
  const futuresConditions = [
    momentumStrong && trendStrong && mtfAligned,
    volHigh && trendStrong,
    riskPct > 1 && riskPct < 5,
    rr >= 2,
  ];
  const futuresScore = futuresConditions.filter(Boolean).length;

  // SPOT conditions: stable market, lower risk, controlled volatility
  const spotConditions = [
    !momentumStrong || !trendStrong,
    riskPct < 3,
    rr >= 1.5,
    mtfDirection !== 'neutral',
    trendScore >= 2,
  ];
  const spotScore = spotConditions.filter(Boolean).length;

  // Prefer futures if conditions are strong
  if (futuresScore >= 3 && rr >= 2) {
    const reasons = [];
    if (momentumStrong) reasons.push('strong momentum');
    if (trendStrong) reasons.push('strong trend alignment');
    if (volHigh) reasons.push('volume expansion');
    if (mtfAligned) reasons.push('multi-timeframe alignment');
    return {
      type: 'futures',
      confidence: Math.min(95, 60 + futuresScore * 10),
      reasoning: `AI recommends FUTURES trading due to ${reasons.join(', ')} and high-confidence continuation setup.`,
      suggestedLeverage: Math.min(RISK_LEVERAGE[prefs.riskLevel] || 5, Math.max(1, Math.floor(100 / riskPct))),
      riskWarning: 'Liquidation risk is higher in futures. Use proper position sizing.',
    };
  }

  if (spotScore >= 3) {
    const reasons = [];
    if (riskPct < 3) reasons.push('controlled risk');
    if (rr >= 1.5) reasons.push('favorable risk/reward');
    if (trendScore >= 2) reasons.push('trend confirmation');
    return {
      type: 'spot',
      confidence: Math.min(90, 50 + spotScore * 10),
      reasoning: `AI recommends SPOT trading because market conditions are stable with ${reasons.join(', ')} and lower liquidation risk.`,
      suggestedLeverage: 1,
      riskWarning: 'Spot trading has no liquidation risk. Secure long-term position.',
    };
  }

  // No suitable opportunity - avoid trade
  return {
    type: 'avoid',
    confidence: 0,
    reasoning: `No safe trade opportunity currently available. Conditions are not favorable for either spot or futures trading.`,
    suggestedLeverage: 1,
    riskWarning: 'Market conditions are uncertain. Wait for better setup.',
  };
}

function buildFindTradeReasons(symbol, confirmations, mtf, isBuy) {
  const action = isBuy ? 'LONG' : 'SHORT';
  const trend = confirmations.trend.reasons.slice(0, 2).join(', ');
  const momentum = confirmations.momentum.reasons.slice(0, 2).join(', ');
  const volume = confirmations.volume.reasons.slice(0, 1).join(', ');
  return `${symbol} ${action} opportunity found. ` +
    `Trend: ${trend}. ` +
    `Momentum: ${momentum}. ` +
    `Volume: ${volume}. ` +
    `MTF: ${mtf.alignment?.bullCount || 0}B/${mtf.alignment?.bearCount || 0}Br.`;
}

// ============ SYMBOL FETCHING ============

async function fetchTopSymbols(exchange, limit = 60) {
  try {
    const service = restServices[exchange];
    if (!service) return [];
    const tickers = await service.get24hTickers();
    return tickers
      .filter(t => t.symbol.endsWith('USDT'))
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, limit)
      .map(t => t.symbol);
  } catch {
    return [];
  }
}

async function fetchKlines(exchange, symbol, interval, limit) {
  try {
    const service = restServices[exchange];
    if (!service) return [];
    return await service.getKlines(symbol, interval, limit);
  } catch {
    return [];
  }
}

// ============ SYMBOL ANALYSIS ============

async function analyzeSymbol(symbol, prefs) {
  try {
    const tf = prefs.timeframe || '1h';
    const klines = await fetchKlines(prefs.exchange, symbol, tf, 300);
    if (!klines || klines.length < 100) return null;

    const closes = klines.map(k => k.close);
    const volumes = klines.map(k => k.volume);
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const latest = closes[closes.length - 1];

    const rsi = calcRSI(closes, 14);
    const ema9 = calcEMA(closes, 9);
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const volSma = calcSMA(volumes, 20);
    const atr = calcATR(highs, lows, closes, 14);
    const macd = calcMACD(closes);

    let score = 0;
    const reasons = [];
    let trend = 'neutral';
    let setup = 'none';
    let riskLevel = 'medium';
    let trendStrength = 0;
    let volumeStrength = 0;
    let volatility = 0;

    // Trend scoring with strength
    if (ema9 && ema20 && ema50) {
      if (latest > ema9 && ema9 > ema20 && ema20 > ema50) {
        score += 25; trend = 'bullish'; trendStrength = 85; reasons.push('Strong bullish EMA stack');
      } else if (latest < ema9 && ema9 < ema20 && ema20 < ema50) {
        score += 25; trend = 'bearish'; trendStrength = 85; reasons.push('Strong bearish EMA stack');
      } else if (latest > ema9 && ema9 > ema20) {
        trendStrength = 60; reasons.push('Moderate bullish trend');
      } else if (latest < ema9 && ema9 < ema20) {
        trendStrength = 60; reasons.push('Moderate bearish trend');
      } else {
        trendStrength = 30;
      }
    }

    // RSI
    if (rsi !== null) {
      if (rsi < 30) { score += 15; reasons.push('RSI oversold'); setup = 'reversal'; }
      else if (rsi > 30 && rsi < 45) { score += 10; reasons.push('RSI recovering'); }
      else if (rsi > 70) { score += 10; reasons.push('RSI overbought'); setup = 'reversal'; }
      else if (rsi >= 45 && rsi <= 65) { score += 8; reasons.push('RSI healthy'); setup = 'continuation'; }
    }

    // MACD
    if (macd) {
      if (macd.histogram > 0 && macd.prevHistogram <= 0) { score += 12; reasons.push('MACD bullish crossover'); }
      else if (macd.histogram < 0 && macd.prevHistogram >= 0) { score += 12; reasons.push('MACD bearish crossover'); }
      else if (macd.histogram > 0) { score += 5; reasons.push('MACD positive'); }
    }

    // Volume strength
    if (volSma && volumes[volumes.length - 1]) {
      const volRatio = volumes[volumes.length - 1] / volSma;
      volumeStrength = Math.min(100, volRatio * 50);
      if (volRatio > 2) { score += 15; reasons.push(`Volume surge ${volRatio.toFixed(1)}x`); }
      else if (volRatio > 1.5) { score += 10; reasons.push(`Volume ${volRatio.toFixed(1)}x avg`); }
      else if (volRatio > 1.0) { score += 5; reasons.push('Healthy volume'); }
    }

    // Structure
    const lookback = Math.min(30, closes.length);
    const mid = Math.floor(lookback / 2);
    const firstHigh = Math.max(...closes.slice(-lookback, -mid));
    const secondHigh = Math.max(...closes.slice(-mid));
    const firstLow = Math.min(...closes.slice(-lookback, -mid));
    const secondLow = Math.min(...closes.slice(-mid));

    if (secondHigh > firstHigh && secondLow > firstLow) {
      score += 15; reasons.push('HH + HL structure'); setup = 'continuation';
    } else if (secondHigh < firstHigh && secondLow < firstLow) {
      score += 15; reasons.push('LH + LL structure');
    }

    // Breakout
    const recentHigh = Math.max(...highs.slice(-20));
    const recentLow = Math.min(...lows.slice(-20));
    if (latest > recentHigh * 0.995) { score += 10; reasons.push('Breakout candidate'); setup = 'breakout'; }
    if (latest < recentLow * 1.005) { score += 10; reasons.push('Breakdown candidate'); setup = 'breakdown'; }

    // Volatility
    if (atr && latest) {
      const atrPct = (atr / latest) * 100;
      volatility = Math.min(100, atrPct * 20);
      if (atrPct > 5) { riskLevel = 'high'; score += 5; reasons.push('High volatility'); }
      else if (atrPct > 2) { riskLevel = 'medium'; reasons.push('Moderate volatility'); }
      else if (atrPct < 1) { riskLevel = 'low'; score -= 5; reasons.push('Low volatility'); }
    }

    // Direction filter
    if (prefs.direction === 'long' && trend === 'bearish') score -= 20;
    if (prefs.direction === 'short' && trend === 'bullish') score -= 20;

    // EMA crossover
    if (ema9 && ema20) {
      const prevEma9 = calcEMA(closes.slice(0, -1), 9);
      const prevEma20 = calcEMA(closes.slice(0, -1), 20);
      if (prevEma9 && prevEma20) {
        if (prevEma9 < prevEma20 && ema9 > ema20) { score += 10; reasons.push('EMA bullish crossover'); }
        if (prevEma9 > prevEma20 && ema9 < ema20) { score += 10; reasons.push('EMA bearish crossover'); }
      }
    }

    const opportunityScore = Math.min(100, Math.max(0, score));

    return {
      symbol,
      opportunityScore,
      trend,
      trendStrength,
      volumeStrength,
      volatility,
      setup,
      riskLevel,
      price: latest,
      change24h: ((latest - closes[Math.max(0, closes.length - 24)]) / closes[Math.max(0, closes.length - 24)] * 100) || 0,
      rsi: rsi ? +rsi.toFixed(2) : null,
      volume: volumes[volumes.length - 1],
      reasons: reasons.slice(0, 4),
    };
  } catch {
    return null;
  }
}

// ============ CONFIRMATION FUNCTIONS ============

function confirmTrend(indicators, closes, mtf) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const ema9 = getLatest(indicators.ema9);
  const ema20 = getLatest(indicators.ema20);
  const ema50 = getLatest(indicators.ema50);
  const sma200 = getLatest(indicators.sma200);
  const latest = closes[closes.length - 1];

  let bull = 0, bear = 0, reasons = [];

  if (ema9 && ema20 && ema50) {
    if (latest > ema9 && ema9 > ema20 && ema20 > ema50) { bull += 3; reasons.push('EMA bullish stack'); }
    if (latest < ema9 && ema9 < ema20 && ema20 < ema50) { bear += 3; reasons.push('EMA bearish stack'); }
  }
  if (sma200) {
    if (latest > sma200) { bull += 1; reasons.push('Above SMA200'); }
    else { bear += 1; reasons.push('Below SMA200'); }
  }
  if (mtf.alignment.aligned) {
    if (mtf.alignment.direction === 'bullish') { bull += 2; reasons.push('MTF aligned bullish'); }
    if (mtf.alignment.direction === 'bearish') { bear += 2; reasons.push('MTF aligned bearish'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  return { passed: Math.abs(bull - bear) >= 3, direction, score: Math.abs(bull - bear), reasons };
}

function confirmMomentum(indicators, closes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const getPrev = (arr) => arr.length > 1 ? arr[arr.length - 2].value : null;

  const rsi = getLatest(indicators.rsi);
  const macd = getLatest(indicators.macd);
  const macdSignal = getLatest(indicators.macdSignal);
  const macdHist = getLatest(indicators.macdHist);
  const adx = getLatest(indicators.adx);
  const adxPlus = getLatest(indicators.adxPlus);
  const adxMinus = getLatest(indicators.adxMinus);
  const stochK = getLatest(indicators.stochK);
  const stochD = getLatest(indicators.stochD);

  let bull = 0, bear = 0, reasons = [];

  if (rsi !== null) {
    if (rsi > 50 && rsi < 75) { bull += 2; reasons.push(`RSI ${rsi.toFixed(0)} bullish`); }
    if (rsi < 50 && rsi > 25) { bear += 2; reasons.push(`RSI ${rsi.toFixed(0)} bearish`); }
    if (rsi > 70) { bear += 1; reasons.push(`RSI ${rsi.toFixed(0)} overbought — caution`); }
    if (rsi < 30) { bull += 1; reasons.push(`RSI ${rsi.toFixed(0)} oversold — bounce possible`); }
  }
  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal) { bull += 2; reasons.push('MACD above signal'); }
    if (macd < macdSignal) { bear += 2; reasons.push('MACD below signal'); }
    if (macdHist > 0) { bull += 1; reasons.push('MACD histogram expanding'); }
    if (macdHist < 0) { bear += 1; reasons.push('MACD histogram declining'); }
    const prevMacd = getPrev(indicators.macd);
    const prevSignal = getPrev(indicators.macdSignal);
    if (prevMacd && prevSignal) {
      if (prevMacd < prevSignal && macd > macdSignal) { bull += 3; reasons.push('MACD bullish crossover'); }
      if (prevMacd > prevSignal && macd < macdSignal) { bear += 3; reasons.push('MACD bearish crossunder'); }
    }
  }
  if (stochK !== null && stochD !== null) {
    if (stochK > stochD && stochK < 80) { bull += 1; reasons.push('Stochastic bullish'); }
    if (stochK < stochD && stochK > 20) { bear += 1; reasons.push('Stochastic bearish'); }
  }
  if (adx !== null && adxPlus !== null && adxMinus !== null) {
    if (adx > 25 && adxPlus > adxMinus) { bull += 2; reasons.push(`ADX ${adx.toFixed(0)} +DI dominant — strong uptrend`); }
    if (adx > 25 && adxMinus > adxPlus) { bear += 2; reasons.push(`ADX ${adx.toFixed(0)} -DI dominant — strong downtrend`); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  return { passed: Math.abs(bull - bear) >= 4, direction, score: Math.abs(bull - bear), reasons };
}

function confirmVolume(indicators, volumes, klines) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const volSma = getLatest(indicators.volumeSma);
  const obv = indicators.obv;
  const latestVol = volumes[volumes.length - 1];
  const closes = klines.map(k => k.close);
  const latestClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];

  let bull = 0, bear = 0, reasons = [];

  if (volSma && latestVol) {
    const ratio = latestVol / volSma;
    if (ratio > 1.5) {
      if (latestClose > prevClose) { bull += 3; reasons.push(`Volume surge ${ratio.toFixed(1)}x with price up`); }
      else { bear += 3; reasons.push(`Volume surge ${ratio.toFixed(1)}x with price down — distribution`); }
    } else if (ratio > 1.0) {
      if (latestClose > prevClose) { bull += 1; reasons.push('Above avg volume + positive price'); }
      else { bear += 1; reasons.push('Above avg volume + negative price'); }
    } else {
      reasons.push('Below average volume — low participation');
    }
  }

  if (obv && obv.length >= 10) {
    const recent = obv.slice(-10).map(d => d.value);
    const slope = recent[9] - recent[0];
    if (slope > 0) { bull += 1; reasons.push('OBV rising — accumulation'); }
    if (slope < 0) { bear += 1; reasons.push('OBV falling — distribution'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  return { passed: Math.abs(bull - bear) >= 1 || (volSma && latestVol / volSma > 1.3), direction, score: Math.abs(bull - bear), reasons };
}

function confirmStructure(klines, indicators, closes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const bbUpper = getLatest(indicators.bbUpper);
  const bbLower = getLatest(indicators.bbLower);
  const bbMiddle = getLatest(indicators.bbMiddle);
  const latest = closes[closes.length - 1];
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);

  let bull = 0, bear = 0, reasons = [];

  const lookback = Math.min(30, closes.length);
  const mid = Math.floor(lookback / 2);
  const firstHalfHigh = Math.max(...closes.slice(-lookback, -mid));
  const secondHalfHigh = Math.max(...closes.slice(-mid));
  const firstHalfLow = Math.min(...closes.slice(-lookback, -mid));
  const secondHalfLow = Math.min(...closes.slice(-mid));

  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) { bull += 3; reasons.push('Higher highs + higher lows — uptrend structure'); }
  if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) { bear += 3; reasons.push('Lower highs + lower lows — downtrend structure'); }

  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  if (latest >= recentHigh * 0.998) { bull += 2; reasons.push('Near resistance breakout'); }
  if (latest <= recentLow * 1.002) { bear += 2; reasons.push('Near support breakdown'); }

  if (bbUpper && bbLower && bbMiddle) {
    if (latest > bbMiddle && latest < bbUpper) { bull += 1; reasons.push('Trading in upper BB channel'); }
    if (latest < bbMiddle && latest > bbLower) { bear += 1; reasons.push('Trading in lower BB channel'); }
    if (latest > bbUpper) { bull += 1; reasons.push('Above upper BB — momentum'); }
    if (latest < bbLower) { bear += 1; reasons.push('Below lower BB — momentum'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  return { passed: Math.abs(bull - bear) >= 2, direction, score: Math.abs(bull - bear), reasons };
}

function confirmVolatility(indicators, closes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const atr = getLatest(indicators.atr);
  const latest = closes[closes.length - 1];
  const reasons = [];
  let passed = true;

  if (atr && latest) {
    const atrPct = (atr / latest) * 100;
    if (atrPct < 0.5) { passed = false; reasons.push(`Low volatility (${atrPct.toFixed(2)}%) — choppy market, avoid`); }
    else if (atrPct > 8) { reasons.push(`Extreme volatility (${atrPct.toFixed(2)}%) — high risk`); }
    else { reasons.push(`Healthy volatility (${atrPct.toFixed(2)}%) — ideal for trading`); }
  }

  return { passed, direction: 'neutral', score: 0, reasons };
}

function confirmSentiment(indicators, closes, volumes) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const rsi = getLatest(indicators.rsi);
  const macdHist = getLatest(indicators.macdHist);
  const latestClose = closes[closes.length - 1];
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : null;
  const latestVol = volumes[volumes.length - 1];
  const volSma = getLatest(indicators.volumeSma);

  let bull = 0, bear = 0, reasons = [];

  // Price momentum
  if (prevClose) {
    const priceChange = ((latestClose - prevClose) / prevClose) * 100;
    if (priceChange > 1) { bull += 2; reasons.push(`Strong bullish candle +${priceChange.toFixed(2)}%`); }
    else if (priceChange > 0.3) { bull += 1; reasons.push(`Green candle +${priceChange.toFixed(2)}%`); }
    else if (priceChange < -1) { bear += 2; reasons.push(`Strong bearish candle ${priceChange.toFixed(2)}%`); }
    else if (priceChange < -0.3) { bear += 1; reasons.push(`Red candle ${priceChange.toFixed(2)}%`); }
  }

  // Volume confirmation of price move
  if (volSma && latestVol && prevClose) {
    const volRatio = latestVol / volSma;
    const priceUp = latestClose > prevClose;
    if (volRatio > 1.5 && priceUp) { bull += 2; reasons.push('High volume confirming uptrend'); }
    if (volRatio > 1.5 && !priceUp) { bear += 2; reasons.push('High volume confirming downtrend'); }
  }

  // RSI sentiment
  if (rsi !== null) {
    if (rsi > 60) { bull += 1; reasons.push('Bullish sentiment (RSI > 60)'); }
    if (rsi < 40) { bear += 1; reasons.push('Bearish sentiment (RSI < 40)'); }
  }

  const direction = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  return { passed: Math.abs(bull - bear) >= 2, direction, score: Math.abs(bull - bear), reasons };
}

// ============ QUALITY GATE ============

function runQualityGate(confirmations, mtf, passed, bullSignals, bearSignals, prefs) {
  const reasons = [];
  const risk = prefs?.riskLevel || 'moderate';

  if (mtf.alignment.totalValid >= 3) {
    const minTf = risk === 'safe' ? 3 : 2;
    if (mtf.alignment.bullCount < minTf && mtf.alignment.bearCount < minTf) {
      reasons.push(`Weak MTF alignment (${mtf.alignment.bullCount}B/${mtf.alignment.bearCount}Br) — need ${minTf}+`);
    }
  }

  if (passed < 2) reasons.push(`Only ${passed}/6 confirmations — need 2 minimum`);

  if (bullSignals < 2 && bearSignals < 2) reasons.push('No clear directional bias across indicators');

  return {
    passed: reasons.length === 0,
    reason: reasons.length > 0
      ? `Smart filtering: ${reasons.join('; ')}.`
      : 'All quality gates passed',
    reasons,
  };
}

// ============ RISK/REWARD ============

function calculateRiskReward(klines, indicators, isBuy) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const latest = closes[closes.length - 1];
  const atr = getLatest(indicators.atr) || latest * 0.02;

  const lookback = Math.min(50, closes.length);
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  let entryZone, sl, tp1, tp2, tp3;

  if (isBuy) {
    entryZone = { low: +(latest - atr * 0.3).toFixed(8), high: +(latest + atr * 0.3).toFixed(8) };
    const structureSL = Math.min(...recentLows.slice(-10));
    sl = +Math.max(structureSL - atr * 0.2, latest - atr * 2).toFixed(8);
    const risk = latest - sl;
    tp1 = +(latest + risk * 1.5).toFixed(8);
    tp2 = +(latest + risk * 2.5).toFixed(8);
    tp3 = +(latest + risk * 4).toFixed(8);
  } else {
    entryZone = { low: +(latest - atr * 0.3).toFixed(8), high: +(latest + atr * 0.3).toFixed(8) };
    const structureSL = Math.max(...recentHighs.slice(-10));
    sl = +Math.min(structureSL + atr * 0.2, latest + atr * 2).toFixed(8);
    const risk = sl - latest;
    tp1 = +(latest - risk * 1.5).toFixed(8);
    tp2 = +(latest - risk * 2.5).toFixed(8);
    tp3 = +(latest - risk * 4).toFixed(8);
  }

  const risk = Math.abs(entryZone.low - sl);
  const reward = Math.abs(tp2 - (entryZone.low + entryZone.high) / 2);
  const rrRatio = risk > 0 ? +(reward / risk).toFixed(2) : 0;

  return {
    entryZone,
    stopLoss: sl,
    takeProfits: { tp1, tp2, tp3 },
    rrRatio,
    riskPercent: +((risk / latest) * 100).toFixed(2),
  };
}

function adjustConfidence(baseConfidence, riskReward, mtf, confirmations) {
  let adj = baseConfidence;
  if (riskReward.rrRatio >= 3) adj += 5;
  if (riskReward.rrRatio < 2) adj -= 10;
  if (mtf.alignment.aligned) adj += 5;
  if (confirmations.volume?.passed) adj += 5;
  if (confirmations.sentiment?.passed) adj += 5;
  if (riskReward.riskPercent < 1) adj += 5;
  if (riskReward.riskPercent > 5) adj -= 10;
  return Math.max(0, Math.min(95, adj));
}

// ============ HELPERS ============

function noTrade(reason, symbol, prefs, confirmations, mtf) {
  const result = {
    signal: 'NO_TRADE',
    confidence: 0,
    symbol,
    reason: reason || 'No safe high-confidence setup currently available.',
    exchange: prefs?.exchange || 'binance',
    tradingMode: prefs?.tradingMode || 'intraday',
    timeframe: prefs?.timeframe || '1h',
    riskLevel: prefs?.riskLevel || 'moderate',
    timestamp: Date.now(),
  };
  if (confirmations) result.confirmations = summarizeConfirmations(confirmations);
  if (mtf) result.mtf = mtf.alignment;
  return result;
}

function summarizeConfirmations(confirmations) {
  const summary = {};
  for (const [key, val] of Object.entries(confirmations)) {
    summary[key] = { passed: val.passed, direction: val.direction, score: val.score, topReason: val.reasons[0] || 'N/A' };
  }
  return summary;
}

function extractIndicators(indicators) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  return {
    rsi: getLatest(indicators.rsi) ? +getLatest(indicators.rsi).toFixed(2) : null,
    macd: getLatest(indicators.macd) ? +getLatest(indicators.macd).toFixed(6) : null,
    adx: getLatest(indicators.adx) ? +getLatest(indicators.adx).toFixed(2) : null,
    ema9: getLatest(indicators.ema9) ? +getLatest(indicators.ema9).toFixed(8) : null,
    ema20: getLatest(indicators.ema20) ? +getLatest(indicators.ema20).toFixed(8) : null,
    atr: getLatest(indicators.atr) ? +getLatest(indicators.atr).toFixed(8) : null,
  };
}

function calculateTrendStrength(confirmations) {
  const trendScore = confirmations.trend?.score || 0;
  const momentumScore = confirmations.momentum?.score || 0;
  const structureScore = confirmations.structure?.score || 0;
  return Math.min(100, Math.round((trendScore + momentumScore + structureScore) * 5));
}

function calculateVolumeStrength(confirmations) {
  const volumeScore = confirmations.volume?.score || 0;
  return Math.min(100, volumeScore * 25);
}

function buildExplanation(symbol, signal, confirmations, mtf, riskReward, prefs) {
  const isBuy = signal.includes('BUY');
  const action = isBuy ? 'LONG' : 'SHORT';
  const trendR = confirmations.trend.reasons.slice(0, 2).join(', ');
  const momentumR = confirmations.momentum.reasons.slice(0, 2).join(', ');
  const volumeR = confirmations.volume.reasons.slice(0, 1).join(', ');
  const structureR = confirmations.structure.reasons.slice(0, 1).join(', ');
  const sentimentR = confirmations.sentiment?.reasons?.slice(0, 1).join(', ') || '';

  const tfDetail = mtf.alignment?.details
    ? Object.entries(mtf.alignment.details).map(([tf, dir]) => `${tf}:${dir}`).join(', ')
    : '';

  return `${symbol} ${action} setup confirmed on ${prefs.exchange} (${prefs.timeframe}). ` +
    `Trend: ${trendR}. ` +
    `Momentum: ${momentumR}${momentumR ? '.' : ''} ` +
    `Volume: ${volumeR}. ` +
    `Structure: ${structureR}. ${sentimentR ? `Sentiment: ${sentimentR}.` : ''} ` +
    `Multi-timeframe alignment: ${tfDetail} (${mtf.alignment?.bullCount || 0}B/${mtf.alignment?.bearCount || 0}Br). ` +
    `Entry zone: ${riskReward.entryZone.low} - ${riskReward.entryZone.high}. ` +
    `Take profit targets: TP1 ${riskReward.takeProfits.tp1}, TP2 ${riskReward.takeProfits.tp2}, TP3 ${riskReward.takeProfits.tp3}. ` +
    `Stop loss: ${riskReward.stopLoss}. ` +
    `Risk/Reward: ${riskReward.rrRatio}:1 with ${riskReward.riskPercent}% risk per trade. ` +
    `Suggested leverage: 1x-${Math.min(RISK_LEVERAGE[prefs.riskLevel] || 5, Math.max(1, Math.floor(100 / riskReward.riskPercent)))}x. ` +
    `Mode: ${prefs.tradingMode}, Risk: ${prefs.riskLevel}.`;
}

// Quick calculation helpers
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

function calcSMA(data, period) {
  if (data.length < period) return null;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  return sum / period;
}

function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;
  const macdLine = ema12 - ema26;
  const prevMacd = calcEMA(closes.slice(0, -1), 12) - calcEMA(closes.slice(0, -1), 26);
  return { histogram: macdLine, prevHistogram: prevMacd || 0 };
}
