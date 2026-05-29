import {
  EMA, SMA, RSI, MACD, BollingerBands, ATR, Stochastic, ADX, OBV, VWAP
} from 'technicalindicators';

export function calculateAllIndicators(klines) {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  const times = klines.map(k => k.time);

  // Trend indicators
  const ema9 = EMA.calculate({ period: 9, values: closes });
  const ema20 = EMA.calculate({ period: 20, values: closes });
  const ema50 = EMA.calculate({ period: 50, values: closes });
  const sma20 = SMA.calculate({ period: 20, values: closes });
  const sma50 = SMA.calculate({ period: 50, values: closes });
  const sma200 = SMA.calculate({ period: 200, values: closes });

  const adxResult = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });

  // Momentum indicators
  const rsi = RSI.calculate({ period: 14, values: closes });
  const macd = MACD.calculate({
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values: closes,
  });
  const stoch = Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3,
  });

  // Volatility indicators
  const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  // Keltner Channels
  const ema20KC = EMA.calculate({ period: 20, values: closes });
  const atrKC = ATR.calculate({ period: 10, high: highs, low: lows, close: closes });
  const keltnerUpper = [];
  const keltnerLower = [];
  const keltnerMiddle = [];
  const kcMultiplier = 1.5;
  for (let i = 0; i < ema20KC.length; i++) {
    const atrIdx = i + (atrKC.length - ema20KC.length);
    if (atrIdx >= 0 && atrIdx < atrKC.length) {
      keltnerMiddle.push(ema20KC[i]);
      keltnerUpper.push(ema20KC[i] + kcMultiplier * atrKC[atrIdx]);
      keltnerLower.push(ema20KC[i] - kcMultiplier * atrKC[atrIdx]);
    }
  }

  // Volume indicators
  const obv = OBV.calculate({ close: closes, volume: volumes });
  const volumeSma = SMA.calculate({ period: 20, values: volumes });

  // Align all indicators to the same time array (trim from the front)
  const len = closes.length;
  const align = (arr, totalLen = len) => {
    const offset = totalLen - arr.length;
    return arr.map((value, i) => ({ time: times[offset + i], value }));
  };

  return {
    ema9: align(ema9),
    ema20: align(ema20),
    ema50: align(ema50),
    sma20: align(sma20),
    sma50: align(sma50),
    sma200: align(sma200),
    adx: align(adxResult.map(d => d.adx)),
    adxPlus: align(adxResult.map(d => d.pdi)),
    adxMinus: align(adxResult.map(d => d.mdi)),
    rsi: align(rsi),
    macd: align(macd.map(d => d.MACD)),
    macdSignal: align(macd.map(d => d.signal)),
    macdHist: align(macd.map(d => d.histogram)),
    stochK: align(stoch.map(d => d.k)),
    stochD: align(stoch.map(d => d.d)),
    bbUpper: align(bb.map(d => d.upper)),
    bbMiddle: align(bb.map(d => d.middle)),
    bbLower: align(bb.map(d => d.lower)),
    atr: align(atr),
    keltnerUpper: align(keltnerUpper),
    keltnerMiddle: align(keltnerMiddle),
    keltnerLower: align(keltnerLower),
    obv: align(obv),
    volumeSma: align(volumeSma),
  };
}
