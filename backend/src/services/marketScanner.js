import { scanWithPreferences } from './aiScannerEngine.js';

/**
 * AI Market Scanner - Scans top coins and ranks by opportunity
 * Uses the enhanced aiScannerEngine's scanWithPreferences for richer ranking data
 */
export async function scanMarket({ limit = 50, timeframe = '1h', mode = 'conservative' }) {
  const riskLevel = mode === 'conservative' ? 'safe' : mode === 'moderate' ? 'moderate' : 'aggressive';

  const scanResult = await scanWithPreferences({
    exchange: 'binance',
    timeframe,
    riskLevel,
    limit,
    direction: 'both',
  });

  // Filter and return top results
  const minScore = mode === 'aggressive' ? 40 : mode === 'moderate' ? 60 : 75;
  const ranked = scanResult.results
    .filter(r => r.opportunityScore >= minScore && r.opportunityScore > 0)
    .slice(0, 10);

  return {
    scanned: scanResult.scanned,
    qualified: ranked.length,
    mode,
    timeframe,
    results: ranked,
    timestamp: Date.now(),
  };
}
