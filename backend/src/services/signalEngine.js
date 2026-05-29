import { calculateAllIndicators } from './indicators.js';

const SIGNAL_TYPES = {
  STRONG_BUY: 'STRONG_BUY',
  BUY: 'BUY',
  NEUTRAL: 'NEUTRAL',
  SELL: 'SELL',
  STRONG_SELL: 'STRONG_SELL',
};

function detectMarketRegime(klines, adx, atr) {
  const recentCloses = klines.slice(-20).map(k => k.close);
  const avg = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length;
  const variance = recentCloses.reduce((sum, c) => sum + (c - avg) ** 2, 0) / recentCloses.length;
  const volatility = Math.sqrt(variance) / avg;

  const latestAdx = adx.length > 0 ? adx[adx.length - 1].value : 0;
  const latestAtr = atr.length > 0 ? atr[atr.length - 1].value : 0;
  const atrPercent = (latestAtr / avg) * 100;

  if (latestAdx > 25 && volatility > 0.02) return 'volatile_trending';
  if (latestAdx > 25) return 'trending';
  if (atrPercent > 3) return 'volatile';
  return 'ranging';
}

function scoreIndicators(indicators, closes, klines) {
  let score = 0;
  let reasons = [];
  const len = closes.length;
  const latestClose = closes[len - 1];
  const prevClose = closes[len - 2];

  // EMA alignment
  const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;
  const getPrev = (arr) => arr.length > 1 ? arr[arr.length - 2].value : null;

  const ema9 = getLatest(indicators.ema9);
  const ema20 = getLatest(indicators.ema20);
  const ema50 = getLatest(indicators.ema50);
  const sma200 = getLatest(indicators.sma200);

  if (ema9 && ema20 && ema9 > ema20) { score += 1; reasons.push('EMA9 > EMA20 (bullish)'); }
  if (ema9 && ema20 && ema9 < ema20) { score -= 1; reasons.push('EMA9 < EMA20 (bearish)'); }
  if (ema20 && ema50 && ema20 > ema50) { score += 1; reasons.push('EMA20 > EMA50 (uptrend)'); }
  if (ema20 && ema50 && ema20 < ema50) { score -= 1; reasons.push('EMA20 < EMA50 (downtrend)'); }
  if (sma200 && latestClose > sma200) { score += 1; reasons.push('Price above SMA200 (bullish)'); }
  if (sma200 && latestClose < sma200) { score -= 1; reasons.push('Price below SMA200 (bearish)'); }

  // EMA crossover (recent)
  const prevEma9 = getPrev(indicators.ema9);
  const prevEma20 = getPrev(indicators.ema20);
  if (prevEma9 && prevEma20 && ema9 && ema20) {
    if (prevEma9 < prevEma20 && ema9 > ema20) { score += 2; reasons.push('EMA9 crossed above EMA20 (golden cross)'); }
    if (prevEma9 > prevEma20 && ema9 < ema20) { score -= 2; reasons.push('EMA9 crossed below EMA20 (death cross)'); }
  }

  // RSI
  const rsi = getLatest(indicators.rsi);
  if (rsi !== null) {
    if (rsi > 70) { score -= 1; reasons.push(`RSI ${rsi.toFixed(1)} overbought`); }
    if (rsi < 30) { score += 1; reasons.push(`RSI ${rsi.toFixed(1)} oversold`); }
    if (rsi > 50 && rsi < 70) { score += 0.5; reasons.push(`RSI ${rsi.toFixed(1)} bullish zone`); }
    if (rsi < 50 && rsi > 30) { score -= 0.5; reasons.push(`RSI ${rsi.toFixed(1)} bearish zone`); }
  }

  // MACD
  const macd = getLatest(indicators.macd);
  const macdSignal = getLatest(indicators.macdSignal);
  const macdHist = getLatest(indicators.macdHist);
  const prevMacd = getPrev(indicators.macd);
  const prevMacdSignal = getPrev(indicators.macdSignal);

  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal) { score += 1; reasons.push('MACD above signal (bullish)'); }
    if (macd < macdSignal) { score -= 1; reasons.push('MACD below signal (bearish)'); }
    if (prevMacd && prevMacdSignal) {
      if (prevMacd < prevMacdSignal && macd > macdSignal) { score += 2; reasons.push('MACD bullish crossover'); }
      if (prevMacd > prevMacdSignal && macd < macdSignal) { score -= 2; reasons.push('MACD bearish crossover'); }
    }
  }
  if (macdHist !== null) {
    if (macdHist > 0) { score += 0.5; reasons.push('MACD histogram positive'); }
    if (macdHist < 0) { score -= 0.5; reasons.push('MACD histogram negative'); }
  }

  // Stochastic
  const stochK = getLatest(indicators.stochK);
  const stochD = getLatest(indicators.stochD);
  if (stochK !== null && stochD !== null) {
    if (stochK > 80 && stochD > 80) { score -= 0.5; reasons.push('Stochastic overbought'); }
    if (stochK < 20 && stochD < 20) { score += 0.5; reasons.push('Stochastic oversold'); }
    if (stochK > stochD) { score += 0.5; reasons.push('Stochastic K > D (bullish)'); }
    if (stochK < stochD) { score -= 0.5; reasons.push('Stochastic K < D (bearish)'); }
  }

  // ADX
  const adx = getLatest(indicators.adx);
  const adxPlus = getLatest(indicators.adxPlus);
  const adxMinus = getLatest(indicators.adxMinus);
  if (adx !== null) {
    if (adx > 25 && adxPlus && adxMinus) {
      if (adxPlus > adxMinus) { score += 1; reasons.push(`ADX ${adx.toFixed(1)} with +DI > -DI (strong uptrend)`); }
      if (adxPlus < adxMinus) { score -= 1; reasons.push(`ADX ${adx.toFixed(1)} with -DI > +DI (strong downtrend)`); }
    }
    if (adx < 20) { reasons.push(`ADX ${adx.toFixed(1)} weak trend`); }
  }

  // Bollinger Bands
  const bbUpper = getLatest(indicators.bbUpper);
  const bbLower = getLatest(indicators.bbLower);
  const bbMiddle = getLatest(indicators.bbMiddle);
  if (bbUpper && bbLower && bbMiddle) {
    if (latestClose > bbUpper) { score -= 1; reasons.push('Price above upper Bollinger Band (overbought)'); }
    if (latestClose < bbLower) { score += 1; reasons.push('Price below lower Bollinger Band (oversold)'); }
    if (latestClose > bbMiddle && latestClose < bbUpper) { score += 0.5; reasons.push('Price in upper Bollinger channel'); }
    if (latestClose < bbMiddle && latestClose > bbLower) { score -= 0.5; reasons.push('Price in lower Bollinger channel'); }
  }

  // Volume analysis
  const volSma = getLatest(indicators.volumeSma);
  const latestVol = klines[klines.length - 1].volume;
  if (volSma && latestVol) {
    const volRatio = latestVol / volSma;
    if (volRatio > 1.5 && latestClose > prevClose) { score += 1; reasons.push(`Volume ${volRatio.toFixed(1)}x above average with price up`); }
    if (volRatio > 1.5 && latestClose < prevClose) { score -= 1; reasons.push(`Volume ${volRatio.toFixed(1)}x above average with price down`); }
  }

  // OBV trend
  const obv = indicators.obv;
  if (obv.length >= 5) {
    const recentObv = obv.slice(-5).map(d => d.value);
    const obvTrend = recentObv[4] - recentObv[0];
    if (obvTrend > 0) { score += 0.5; reasons.push('OBV rising (accumulation)'); }
    if (obvTrend < 0) { score -= 0.5; reasons.push('OBV falling (distribution)'); }
  }

  return { score, reasons };
}

function calculateRiskReward(klines, atr, signal) {
  const latestClose = klines[klines.length - 1].close;
  const latestAtr = atr.length > 0 ? atr[atr.length - 1].value : latestClose * 0.02;

  let entry, sl, tp1, tp2, tp3;

  if (signal === 'BUY' || signal === 'STRONG_BUY') {
    entry = latestClose;
    sl = entry - latestAtr * 1.5;
    tp1 = entry + latestAtr * 1.5;  // 1:1
    tp2 = entry + latestAtr * 3;    // 1:2
    tp3 = entry + latestAtr * 6;    // 1:4
  } else {
    entry = latestClose;
    sl = entry + latestAtr * 1.5;
    tp1 = entry - latestAtr * 1.5;
    tp2 = entry - latestAtr * 3;
    tp3 = entry - latestAtr * 6;
  }

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp2 - entry);
  const rrRatio = risk > 0 ? reward / risk : 0;

  return {
    entry: +entry.toFixed(8),
    stopLoss: +sl.toFixed(8),
    tp1: +tp1.toFixed(8),
    tp2: +tp2.toFixed(8),
    tp3: +tp3.toFixed(8),
    rrRatio: +rrRatio.toFixed(2),
    atrValue: +latestAtr.toFixed(8),
  };
}

export function generateSignal(klines) {
  if (!klines || klines.length < 50) {
    return { signal: SIGNAL_TYPES.NEUTRAL, confidence: 0, reasons: ['Insufficient data'], marketRegime: 'unknown' };
  }

  const indicators = calculateAllIndicators(klines);
  const closes = klines.map(k => k.close);
  const { score, reasons } = scoreIndicators(indicators, closes, klines);
  const marketRegime = detectMarketRegime(klines, indicators.adx, indicators.atr);

  // Determine signal
  let signal;
  let confidence;

  if (score >= 5) { signal = SIGNAL_TYPES.STRONG_BUY; confidence = Math.min(95, 60 + score * 3); }
  else if (score >= 2) { signal = SIGNAL_TYPES.BUY; confidence = Math.min(85, 50 + score * 4); }
  else if (score <= -5) { signal = SIGNAL_TYPES.STRONG_SELL; confidence = Math.min(95, 60 + Math.abs(score) * 3); }
  else if (score <= -2) { signal = SIGNAL_TYPES.SELL; confidence = Math.min(85, 50 + Math.abs(score) * 4); }
  else { signal = SIGNAL_TYPES.NEUTRAL; confidence = Math.max(20, 50 - Math.abs(score) * 5); }

  // Risk/reward filter
  const riskReward = calculateRiskReward(klines, indicators.atr, signal);
  if (riskReward.rrRatio < 2 && signal !== SIGNAL_TYPES.NEUTRAL) {
    reasons.push(`Risk/Reward ${riskReward.rrRatio}:1 below minimum 2:1`);
    // Downgrade signal
    if (signal === SIGNAL_TYPES.STRONG_BUY) signal = SIGNAL_TYPES.BUY;
    else if (signal === SIGNAL_TYPES.STRONG_SELL) signal = SIGNAL_TYPES.SELL;
    confidence = Math.max(20, confidence - 15);
  }

  // Multi-timeframe volume confirmation
  const recentVols = klines.slice(-10).map(k => k.volume);
  const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
  const latestVol = recentVols[recentVols.length - 1];
  if (latestVol < avgVol * 0.5 && signal !== SIGNAL_TYPES.NEUTRAL) {
    reasons.push('Low volume warning - signal may be weak');
    confidence = Math.max(20, confidence - 10);
  }

  return {
    signal,
    confidence: Math.round(confidence),
    reasons,
    marketRegime,
    riskReward,
    indicators: {
      rsi: indicators.rsi.length > 0 ? +indicators.rsi[indicators.rsi.length - 1].value.toFixed(2) : null,
      macd: indicators.macd.length > 0 ? +indicators.macd[indicators.macd.length - 1].value.toFixed(6) : null,
      macdSignal: indicators.macdSignal.length > 0 ? +indicators.macdSignal[indicators.macdSignal.length - 1].value.toFixed(6) : null,
      adx: indicators.adx.length > 0 ? +indicators.adx[indicators.adx.length - 1].value.toFixed(2) : null,
      ema9: indicators.ema9.length > 0 ? +indicators.ema9[indicators.ema9.length - 1].value.toFixed(8) : null,
      ema20: indicators.ema20.length > 0 ? +indicators.ema20[indicators.ema20.length - 1].value.toFixed(8) : null,
      ema50: indicators.ema50.length > 0 ? +indicators.ema50[indicators.ema50.length - 1].value.toFixed(8) : null,
    },
    timestamp: Date.now(),
    symbol: klines.length > 0 ? 'UNKNOWN' : 'UNKNOWN',
  };
}
