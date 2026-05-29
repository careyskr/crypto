export function formatPrice(price: number | null | undefined): string {
  if (price == null || isNaN(price)) return '—';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

export function formatVolume(vol: number): string {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K';
  return vol.toFixed(2);
}

export function formatPercent(pct: number | null | undefined): string {
  if (pct == null || isNaN(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

export function formatSymbol(symbol: string): string {
  return symbol.replace('USDT', '/USDT');
}

export function getBaseAsset(symbol: string): string {
  const quoteCurrencies = ['USDT', 'BUSD', 'USDC', 'DAI', 'BIDR', 'AUD', 'BRL', 'EUR', 'GBP', 'RUB', 'TRY', 'TUSD', 'PAX', 'NGN', 'ZAR', 'IDRT', 'BVND', 'VAI'];
  for (const q of quoteCurrencies) {
    if (symbol.endsWith(q)) return symbol.slice(0, -q.length);
  }
  return symbol;
}
