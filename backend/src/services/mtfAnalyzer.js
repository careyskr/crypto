import { BinanceRestService } from './binanceRest.js';
import { calculateAllIndicators } from './indicators.js';

const binance = new BinanceRestService();

const TIMEFRAMES = ['15m', '1h', '4h', '1d', '1w'];

const INTERVAL_MAP = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

/**
 * Multi-Timeframe Analyzer
 * Analyzes a symbol across 5 timeframes to determine trend alignment
 */
export async function analyzeMTF(symbol, primaryTf = '1h') {
  const results = {};

  // Fetch klines for all timeframes in parallel
  const fetches = await Promise.allSettled(
    TIMEFRAMES.map(tf => binance.getKlines(symbol, tf, 300))
  );

  for (let i = 0; i < TIMEFRAMES.length; i++) {
    const tf = TIMEFRAMES[i];
    if (fetches[i].status === 'fulfilled' && fetches[i].value.length >= 50) {
      const klines = fetches[i].value;
      const indicators = calculateAllIndicators(klines);
      const closes = klines.map(k => k.close);
      const latest = closes[closes.length - 1];

      results[tf] = analyzeTimeframe(tf, klines, indicators, latest);
    } else {
      results[tf] = { trend: 'unknown', strength: 0, valid: false };
    }
  }

  // Calculate alignment score
  const alignment = calculateAlignment(results);

  return {
    timeframes: results,
    alignment,
    primaryTf,
  };
}

function analyzeTimeframe(tf, klines, indicators, latestClose) {
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const getPrev = (arr) => arr.length > 1 ? arr[arr.length - 2].value : null;

  const ema9 = getLatest(indicators.ema9);
  const ema20 = getLatest(indicators.ema20);
  const ema50 = getLatest(indicators.ema50);
  const sma200 = getLatest(indicators.sma200);
  const rsi = getLatest(indicators.rsi);
  const macd = getLatest(indicators.macd);
  const macdSignal = getLatest(indicators.macdSignal);
  const macdHist = getLatest(indicators.macdHist);
  const adx = getLatest(indicators.adx);
  const adxPlus = getLatest(indicators.adxPlus);
  const adxMinus = getLatest(indicators.adxMinus);
  const bbUpper = getLatest(indicators.bbUpper);
  const bbLower = getLatest(indicators.bbLower);
  const bbMiddle = getLatest(indicators.bbMiddle);
  const atr = getLatest(indicators.atr);
  const stochK = getLatest(indicators.stochK);
  const stochD = getLatest(indicators.stochD);
  const obv = indicators.obv;

  let bullScore = 0;
  let bearScore = 0;
  let reasons = [];

  // EMA alignment
  if (ema9 && ema20 && ema9 > ema20) { bullScore += 2; reasons.push('EMA9 > EMA20'); }
  if (ema9 && ema20 && ema9 < ema20) { bearScore += 2; reasons.push('EMA9 < EMA20'); }
  if (ema20 && ema50 && ema20 > ema50) { bullScore += 2; reasons.push('EMA20 > EMA50'); }
  if (ema20 && ema50 && ema20 < ema50) { bearScore += 2; reasons.push('EMA20 < EMA50'); }
  if (sma200 && latestClose > sma200) { bullScore += 1; reasons.push('Above SMA200'); }
  if (sma200 && latestClose < sma200) { bearScore += 1; reasons.push('Below SMA200'); }

  // Price vs EMAs (trend strength)
  if (ema9 && ema20 && ema50 && latestClose > ema9 && ema9 > ema20 && ema20 > ema50) {
    bullScore += 3; reasons.push('Strong bullish alignment');
  }
  if (ema9 && ema20 && ema50 && latestClose < ema9 && ema9 < ema20 && ema20 < ema50) {
    bearScore += 3; reasons.push('Strong bearish alignment');
  }

  // RSI
  if (rsi !== null) {
    if (rsi > 55 && rsi < 75) { bullScore += 2; reasons.push(`RSI ${rsi.toFixed(0)} bullish`); }
    if (rsi < 45 && rsi > 25) { bearScore += 2; reasons.push(`RSI ${rsi.toFixed(0)} bearish`); }
    if (rsi > 70) { bearScore += 1; reasons.push(`RSI ${rsi.toFixed(0)} overbought`); }
    if (rsi < 30) { bullScore += 1; reasons.push(`RSI ${rsi.toFixed(0)} oversold`); }
    if (rsi >= 45 && rsi <= 55) { reasons.push(`RSI ${rsi.toFixed(0)} neutral`); }
  }

  // MACD
  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal && macdHist > 0) { bullScore += 2; reasons.push('MACD bullish'); }
    if (macd < macdSignal && macdHist < 0) { bearScore += 2; reasons.push('MACD bearish'); }

    const prevMacd = getPrev(indicators.macd);
    const prevSignal = getPrev(indicators.macdSignal);
    if (prevMacd && prevSignal) {
      if (prevMacd < prevSignal && macd > macdSignal) { bullScore += 3; reasons.push('MACD crossover'); }
      if (prevMacd > prevSignal && macd < macdSignal) { bearScore += 3; reasons.push('MACD crossunder'); }
    }
  }

  // ADX
  if (adx !== null && adxPlus !== null && adxMinus !== null) {
    if (adx > 25) {
      if (adxPlus > adxMinus) { bullScore += 2; reasons.push(`ADX ${adx.toFixed(0)} +DI dominant`); }
      if (adxMinus > adxPlus) { bearScore += 2; reasons.push(`ADX ${adx.toFixed(0)} -DI dominant`); }
    }
    if (adx > 40) {
      if (adxPlus > adxMinus) { bullScore += 1; reasons.push('Strong trend'); }
      if (adxMinus > adxPlus) { bearScore += 1; reasons.push('Strong trend'); }
    }
  }

  // Bollinger Bands
  if (bbUpper && bbLower && bbMiddle) {
    if (latestClose > bbMiddle && latestClose < bbUpper) { bullScore += 1; reasons.push('Upper BB channel'); }
    if (latestClose < bbMiddle && latestClose > bbLower) { bearScore += 1; reasons.push('Lower BB channel'); }
    if (latestClose > bbUpper) { bearScore += 1; reasons.push('Above upper BB'); }
    if (latestClose < bbLower) { bullScore += 1; reasons.push('Below lower BB'); }
  }

  // Stochastic
  if (stochK !== null && stochD !== null) {
    if (stochK > stochD && stochK < 80) { bullScore += 1; reasons.push('Stoch K > D'); }
    if (stochK < stochD && stochK > 20) { bearScore += 1; reasons.push('Stoch K < D'); }
  }

  // Volume trend
  if (obv.length >= 10) {
    const recentObv = obv.slice(-10).map(d => d.value);
    const obvSlope = (recentObv[9] - recentObv[0]) / Math.abs(recentObv[0] || 1);
    if (obvSlope > 0.05) { bullScore += 1; reasons.push('OBV rising'); }
    if (obvSlope < -0.05) { bearScore += 1; reasons.push('OBV falling'); }
  }

  // Determine trend
  const totalScore = bullScore + bearScore;
  let trend = 'neutral';
  let strength = 0;

  if (bullScore > bearScore * 1.5) {
    trend = 'bullish';
    strength = Math.min(100, Math.round((bullScore / Math.max(totalScore, 1)) * 100));
  } else if (bearScore > bullScore * 1.5) {
    trend = 'bearish';
    strength = Math.min(100, Math.round((bearScore / Math.max(totalScore, 1)) * 100));
  } else {
    strength = Math.round(50 - Math.abs(bullScore - bearScore) * 5);
  }

  // Detect structures
  const structure = detectStructure(klines, indicators);

  return {
    trend,
    strength: Math.max(0, Math.min(100, strength)),
    bullScore,
    bearScore,
    reasons,
    structure,
    rsi: rsi ? +rsi.toFixed(2) : null,
    macd: macd ? +macd.toFixed(6) : null,
    adx: adx ? +adx.toFixed(2) : null,
    ema9: ema9 ? +ema9.toFixed(8) : null,
    ema20: ema20 ? +ema20.toFixed(8) : null,
    ema50: ema50 ? +ema50.toFixed(8) : null,
    atr: atr ? +atr.toFixed(8) : null,
    valid: true,
  };
}

function detectStructure(klines, indicators) {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const len = closes.length;

  // Detect swing highs and lows
  const swingHighs = [];
  const swingLows = [];

  for (let i = 2; i < len - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      swingHighs.push({ index: i, price: highs[i], time: klines[i].time });
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      swingLows.push({ index: i, price: lows[i], time: klines[i].time });
    }
  }

  const latestClose = closes[len - 1];
  const recentHighs = swingHighs.slice(-3);
  const recentLows = swingLows.slice(-3);

  let structure = 'ranging';
  let keyLevels = [];

  // Higher highs and higher lows = uptrend
  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const hh = recentHighs[recentHighs.length-1].price > recentHighs[recentHighs.length-2].price;
    const hl = recentLows[recentLows.length-1].price > recentLows[recentLows.length-2].price;
    const lh = recentHighs[recentHighs.length-1].price < recentHighs[recentHighs.length-2].price;
    const ll = recentLows[recentLows.length-1].price < recentLows[recentLows.length-2].price;

    if (hh && hl) structure = 'uptrend';
    else if (lh && ll) structure = 'downtrend';
    else if (hh && ll) structure = 'expanding';
    else if (lh && hl) structure = 'contracting';
  }

  // Key support/resistance levels
  for (const sh of recentHighs) {
    const dist = Math.abs(latestClose - sh.price) / latestClose;
    if (dist < 0.05) {
      keyLevels.push({ type: 'resistance', price: sh.price, distance: +(dist * 100).toFixed(2) });
    }
  }
  for (const sl of recentLows) {
    const dist = Math.abs(latestClose - sl.price) / latestClose;
    if (dist < 0.05) {
      keyLevels.push({ type: 'support', price: sl.price, distance: +(dist * 100).toFixed(2) });
    }
  }

  // Breakout detection
  let breakout = null;
  if (recentHighs.length > 0) {
    const lastHigh = recentHighs[recentHighs.length - 1].price;
    if (latestClose > lastHigh) {
      breakout = { type: 'bullish', level: lastHigh };
    }
  }
  if (recentLows.length > 0) {
    const lastLow = recentLows[recentLows.length - 1].price;
    if (latestClose < lastLow) {
      breakout = { type: 'bearish', level: lastLow };
    }
  }

  return { structure, keyLevels, breakout, swingHighs: recentHighs, swingLows: recentLows };
}

function calculateAlignment(timeframeResults) {
  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;
  const details = {};

  for (const [tf, data] of Object.entries(timeframeResults)) {
    if (!data.valid) continue;
    details[tf] = data.trend;
    if (data.trend === 'bullish') bullCount++;
    else if (data.trend === 'bearish') bearCount++;
    else neutralCount++;
  }

  const totalValid = bullCount + bearCount + neutralCount;
  let direction = 'neutral';
  let aligned = false;

  if (bullCount >= 3 && bullCount > bearCount) {
    direction = 'bullish';
    aligned = bullCount >= 4;
  } else if (bearCount >= 3 && bearCount > bullCount) {
    direction = 'bearish';
    aligned = bearCount >= 4;
  }

  return {
    direction,
    bullCount,
    bearCount,
    neutralCount,
    totalValid,
    aligned,
    score: Math.round(((Math.max(bullCount, bearCount) / Math.max(totalValid, 1)) * 100)),
    details,
  };
}
