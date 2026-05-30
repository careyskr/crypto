export function formatPrice(price: unknown): string {
  const p = typeof price === 'string' ? parseFloat(price) : (price as number);
  if (p == null || isNaN(p)) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

export function formatVolume(vol: unknown): string {
  const v = typeof vol === 'string' ? parseFloat(vol) : (vol as number);
  if (v == null || isNaN(v)) return '0.00';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}

export function formatPercent(pct: unknown): string {
  const p = typeof pct === 'string' ? parseFloat(pct) : (pct as number);
  if (p == null || isNaN(p)) return '—';
  const sign = p >= 0 ? '+' : '';
  return sign + p.toFixed(2) + '%';
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
