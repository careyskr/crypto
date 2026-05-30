// Legacy API module — all endpoints now use direct Binance API from browser (binanceApi.ts)
export async function fetchPriceComparison(symbol: string) {
  const res = await fetch(`/api/exchanges/compare/${symbol}`);
  if (!res.ok) throw new Error('Failed to compare prices');
  return res.json();
}
