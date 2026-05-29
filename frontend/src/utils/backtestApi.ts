export async function runBacktest(symbol: string, interval: string, days: number, config?: any) {
  const res = await fetch('/api/backtest/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, interval, days, config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Backtest failed' }));
    throw new Error(err.error || 'Backtest failed');
  }
  return res.json();
}
