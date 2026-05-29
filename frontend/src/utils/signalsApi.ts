export async function fetchSignal(symbol: string, interval: string, explain = false) {
  const res = await fetch(`/api/signals/signal?symbol=${symbol}&interval=${interval}&explain=${explain}`);
  if (!res.ok) throw new Error('Failed to fetch signal');
  return res.json();
}

export async function scanTopSignals(interval: string, mode: string, limit = 50) {
  const res = await fetch(`/api/signals/top?interval=${interval}&mode=${mode}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to scan signals');
  return res.json();
}

export async function scanSymbols(symbols: string[], interval: string, mode: string) {
  const res = await fetch('/api/signals/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, interval, mode }),
  });
  if (!res.ok) throw new Error('Failed to scan');
  return res.json();
}
