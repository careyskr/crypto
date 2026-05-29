import type { TradingPreferences, CoinAnalysisData, FindTradeResult } from '../types/signal';

const BASE = '/api/ai';

export async function fetchAISignal(symbol: string, interval: string, explain = false) {
  const res = await fetch(`${BASE}/signal?symbol=${symbol}&interval=${interval}&explain=${explain}`);
  if (!res.ok) throw new Error('Failed to fetch AI signal');
  return res.json();
}

export async function scanMarketAI(interval: string, mode: string, limit = 50) {
  const res = await fetch(`${BASE}/scan?interval=${interval}&mode=${mode}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to scan market');
  return res.json();
}

export async function batchAISignals(symbols: string[], interval: string, explain = false) {
  const res = await fetch(`${BASE}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, interval, explain }),
  });
  if (!res.ok) throw new Error('Failed to batch signals');
  return res.json();
}

// === NEW: Smart signal with user preferences ===

export async function getPreferences(): Promise<TradingPreferences> {
  const res = await fetch(`${BASE}/preferences`);
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function savePreferences(prefs: Partial<TradingPreferences>): Promise<{ success: boolean; preferences: TradingPreferences }> {
  const res = await fetch(`${BASE}/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  return res.json();
}

export async function scanWithPreferences(prefs: Partial<TradingPreferences> = {}, limit = 60) {
  const params = new URLSearchParams();
  if (prefs.tradingMode) params.set('tradingMode', prefs.tradingMode);
  if (prefs.riskLevel) params.set('riskLevel', prefs.riskLevel);
  if (prefs.timeframe) params.set('timeframe', prefs.timeframe);
  if (prefs.direction) params.set('direction', prefs.direction);
  if (prefs.exchange) params.set('exchange', prefs.exchange);
  params.set('limit', limit.toString());

  const res = await fetch(`${BASE}/smart-scan?${params}`);
  if (!res.ok) throw new Error('Failed to scan with preferences');
  return res.json();
}

export async function generateSmartSignal(symbol: string, prefs: Partial<TradingPreferences> = {}) {
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  if (prefs.tradingMode) params.set('tradingMode', prefs.tradingMode);
  if (prefs.riskLevel) params.set('riskLevel', prefs.riskLevel);
  if (prefs.timeframe) params.set('timeframe', prefs.timeframe);
  if (prefs.direction) params.set('direction', prefs.direction);
  if (prefs.exchange) params.set('exchange', prefs.exchange);

  const res = await fetch(`${BASE}/smart-signal?${params}`);
  if (!res.ok) throw new Error('Failed to generate smart signal');
  return res.json();
}

// === NEW: Analyze Coin and Find Trade ===

export async function analyzeCoinApi(symbol: string, prefs: Partial<TradingPreferences> = {}): Promise<CoinAnalysisData> {
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  if (prefs.timeframe) params.set('timeframe', prefs.timeframe);
  if (prefs.exchange) params.set('exchange', prefs.exchange);

  const res = await fetch(`${BASE}/analyze-coin?${params}`);
  if (!res.ok) throw new Error('Failed to analyze coin');
  return res.json();
}

export async function findTradeApi(symbol: string, prefs: Partial<TradingPreferences> = {}): Promise<FindTradeResult> {
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  if (prefs.tradingMode) params.set('tradingMode', prefs.tradingMode);
  if (prefs.riskLevel) params.set('riskLevel', prefs.riskLevel);
  if (prefs.timeframe) params.set('timeframe', prefs.timeframe);
  if (prefs.direction) params.set('direction', prefs.direction);
  if (prefs.exchange) params.set('exchange', prefs.exchange);

  const res = await fetch(`${BASE}/find-trade?${params}`);
  if (!res.ok) throw new Error('Failed to find trade');
  return res.json();
}
