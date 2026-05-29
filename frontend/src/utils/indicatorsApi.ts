export async function fetchIndicators(symbol: string, interval: string, limit = 500) {
  const res = await fetch(`/api/indicators/calculate?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch indicators');
  return res.json();
}
