export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
  quoteVolume?: number;
  trades?: number;
}

export interface Ticker {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  lastPrice: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
  count: number;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
}

export type TimeInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

export type MarketType = 'spot' | 'futures';

export type Theme = 'dark' | 'light';

export type Exchange = 'binance' | 'bybit' | 'okx' | 'kucoin' | 'coinbase' | 'kraken';
