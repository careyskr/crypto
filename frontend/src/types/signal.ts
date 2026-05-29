export type SignalType = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' | 'NO_TRADE';

export type TradingMode = 'scalping' | 'intraday' | 'swing' | 'spot' | 'futures';
export type RiskLevel = 'safe' | 'moderate' | 'aggressive';
export type TradeDirection = 'long' | 'short' | 'both';
export type SupportedExchange = 'binance' | 'bybit' | 'okx' | 'kucoin' | 'coinbase' | 'kraken' | 'all';

export interface TradingPreferences {
  tradingMode: TradingMode;
  riskLevel: RiskLevel;
  timeframe: string;
  direction: TradeDirection;
  exchange: SupportedExchange;
  marketType: 'spot' | 'futures';
}

export interface RiskReward {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  atrValue: number;
}

export interface ConfirmationInfo {
  passed: boolean;
  direction: string;
  score: number;
  topReason: string;
}

export interface MTFAlignment {
  direction: string;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
  totalValid: number;
  aligned: boolean;
  score: number;
  details: Record<string, string>;
}

export interface TradeSuggestion {
  type: 'spot' | 'futures' | 'avoid';
  confidence: number;
  reasoning: string;
  suggestedLeverage: number;
  riskWarning: string;
}

export interface SignalData {
  signal: SignalType;
  confidence: number;
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  recommendedTradeType?: 'spot' | 'futures' | 'avoid';
  tradeSuggestion?: TradeSuggestion;
  entryZone: { low: number; high: number };
  takeProfits: { tp1: number; tp2: number; tp3: number };
  stopLoss: number;
  riskLevel: string;
  suggestedLeverage: number;
  tradingMode: string;
  timeframe: string;
  rrRatio: number;
  riskPercent: number;
  confirmations: Record<string, ConfirmationInfo>;
  passedConfirmations: string;
  mtf: MTFAlignment;
  indicators: {
    rsi: number | null;
    macd: number | null;
    adx: number | null;
    ema9: number | null;
    ema20: number | null;
    atr: number | null;
  };
  explanation: string;
  marketRegime: string;
  trendStrength: number;
  volumeStrength: number;
  volatility: number;
  timestamp: number;
  reason?: string;
  topCoins?: Array<{ symbol: string; score: number; trend: string }>;
  scanned?: number;
  qualified?: number;
}

export interface ScanResultItem {
  symbol: string;
  opportunityScore: number;
  trend: string;
  trendStrength: number;
  volumeStrength: number;
  volatility: number;
  setup: string;
  riskLevel: string;
  price: number;
  change24h: number;
  rsi: number | null;
  volume: number;
  reasons: string[];
}

export interface ScanResult {
  scanned: number;
  qualified: number;
  preferences: TradingPreferences;
  minConfidence: number;
  results: ScanResultItem[];
  timestamp: number;
}

export interface IndicatorAnalysis {
  value: number | null;
  condition?: string;
}

export interface TrendAnalysis {
  direction: string;
  strength: number;
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  sma200: number | null;
}

export interface MACDAnalysis {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  condition: string;
  crossover: boolean;
}

export interface VolumeAnalysis {
  current: number | null;
  sma: number | null;
  ratio: number | null;
  condition: string;
}

export interface VolatilityAnalysis {
  atr: number | null;
  atrPercent: number | null;
  level: string;
}

export interface SentimentAnalysis {
  direction: string;
  score: number;
  bullishSignals: number;
  bearishSignals: number;
}

export interface StructureInfo {
  structure: string;
  keyLevels: Array<{ type: string; price: number; distance: number }>;
  breakout: { type: string; level: number } | null;
}

export interface CoinAnalysisData {
  symbol: string;
  exchange: string;
  timeframe: string;
  price: number;
  trend: TrendAnalysis;
  rsi: IndicatorAnalysis;
  macd: MACDAnalysis;
  adx: { value: number | null; condition: string; plusDI: number | null; minusDI: number | null };
  bollinger: { upper: number | null; middle: number | null; lower: number | null; condition: string };
  stochastic: { k: number | null; d: number | null; condition: string };
  volume: VolumeAnalysis;
  volatility: VolatilityAnalysis;
  sentiment: SentimentAnalysis;
  obv: { condition: string };
  structure: string;
  keyLevels: Array<{ type: string; price: number; distance: number }>;
  breakout: { type: string; level: number } | null;
  mtf: MTFAlignment | null;
  timestamp: number;
}

export interface FindTradeResult {
  found: boolean;
  message: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  direction?: 'LONG' | 'SHORT';
  confidence?: number;
  tradeSuggestion?: TradeSuggestion;
  entry?: { low: number; high: number };
  takeProfits?: { tp1: number; tp2: number; tp3: number };
  stopLoss?: number;
  rrRatio?: number;
  riskPercent?: number;
  confirmations?: Record<string, ConfirmationInfo>;
  passedConfirmations?: string;
  mtf?: MTFAlignment;
  reasons?: string[];
  timestamp: number;
  nextStep?: string;
}
