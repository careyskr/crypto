export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface IndicatorsData {
  ema9: IndicatorPoint[];
  ema20: IndicatorPoint[];
  ema50: IndicatorPoint[];
  sma20: IndicatorPoint[];
  sma50: IndicatorPoint[];
  sma200: IndicatorPoint[];
  adx: IndicatorPoint[];
  adxPlus: IndicatorPoint[];
  adxMinus: IndicatorPoint[];
  rsi: IndicatorPoint[];
  macd: IndicatorPoint[];
  macdSignal: IndicatorPoint[];
  macdHist: IndicatorPoint[];
  stochK: IndicatorPoint[];
  stochD: IndicatorPoint[];
  bbUpper: IndicatorPoint[];
  bbMiddle: IndicatorPoint[];
  bbLower: IndicatorPoint[];
  atr: IndicatorPoint[];
  keltnerUpper: IndicatorPoint[];
  keltnerMiddle: IndicatorPoint[];
  keltnerLower: IndicatorPoint[];
  obv: IndicatorPoint[];
  volumeSma: IndicatorPoint[];
}
