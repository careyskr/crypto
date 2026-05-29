import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { scanWithPreferences, generateSmartSignal, getPreferences, savePreferences, analyzeCoinApi, findTradeApi } from '../utils/aiApi';
import { formatSymbol, formatPrice, formatPercent } from '../utils/format';
import { BacktestPanel } from './BacktestPanel';
import { TradingPreferences } from './TradingPreferences';
import { CoinActionPanel } from './CoinActionPanel';
import { CoinAnalysis } from './CoinAnalysis';
import type { TradingPreferences as Prefs, ScanResultItem, CoinAnalysisData, FindTradeResult } from '../types/signal';

const SIGNAL_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  STRONG_BUY: { bg: 'bg-accent-green/15', text: 'text-accent-green', border: 'border-accent-green/40', label: 'STRONG BUY' },
  BUY: { bg: 'bg-accent-green/8', text: 'text-accent-green', border: 'border-accent-green/20', label: 'BUY' },
  NO_TRADE: { bg: 'bg-text-muted/8', text: 'text-text-muted', border: 'border-border-primary', label: 'NO SAFE TRADE' },
  SELL: { bg: 'bg-accent-red/8', text: 'text-accent-red', border: 'border-accent-red/20', label: 'SELL' },
  STRONG_SELL: { bg: 'bg-accent-red/15', text: 'text-accent-red', border: 'border-accent-red/40', label: 'STRONG SELL' },
};

type FlowStep = 'idle' | 'scanning' | 'results' | 'action' | 'analyzing' | 'analysis' | 'finding_trade' | 'trade_result' | 'preferences' | 'generating' | 'signal';

export function SignalPanel() {
  const { symbol, signalTriggerSymbol, clearSignalTrigger } = useAppStore();
  const [signal, setSignal] = useState<any>(null);
  const [scanResult, setScanResult] = useState<{ results: ScanResultItem[]; scanned: number; qualified?: number } | null>(null);
  const [analysisData, setAnalysisData] = useState<CoinAnalysisData | null>(null);
  const [findTradeData, setFindTradeData] = useState<FindTradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'signal' | 'backtest'>('signal');
  const [flowStep, setFlowStep] = useState<FlowStep>('idle');
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPreferences().then(p => setPrefs(p)).catch(() => {});
  }, []);

  // Watch for coin selection from marquee/header/sidebar
  useEffect(() => {
    if (signalTriggerSymbol) {
      setTab('signal');
      setSelectedCoin(signalTriggerSymbol);
      setFlowStep('action');
      setError(null);
      clearSignalTrigger();
    }
  }, [signalTriggerSymbol, clearSignalTrigger]);

  // ===== USER FLOW =====
  const runSmartScan = async () => {
    setLoading(true);
    setError(null);
    setFlowStep('scanning');
    try {
      const data = await scanWithPreferences(prefs || {}, 60);
      setScanResult({ results: data.results, scanned: data.scanned, qualified: data.qualified });
      setFlowStep('results');
    } catch {
      setError('Scan failed');
      setFlowStep('idle');
    }
    setLoading(false);
  };

  const selectCoin = (sym: string) => {
    setSelectedCoin(sym);
    setFlowStep('action');
  };

  const generateBest = () => {
    setSelectedCoin('BEST');
    setFlowStep('preferences');
  };

  const generateDirect = async (sym: string) => {
    setLoading(true);
    setError(null);
    setFlowStep('generating');
    try {
      const currentPrefs = prefs || await getPreferences();
      const data = await generateSmartSignal(sym, currentPrefs);
      setSignal(data);
      setFlowStep('signal');
    } catch {
      setError('Signal generation failed');
      setFlowStep('results');
    }
    setLoading(false);
  };

  const handleAnalyzeCoin = async () => {
    if (!selectedCoin) return;
    setLoading(true);
    setError(null);
    setFlowStep('analyzing');
    try {
      const data = await analyzeCoinApi(selectedCoin, prefs || {});
      setAnalysisData(data);
      setFlowStep('analysis');
    } catch {
      setError('Analysis failed');
      setFlowStep('action');
    }
    setLoading(false);
  };

  const handleFindTrade = async () => {
    if (!selectedCoin) return;
    setLoading(true);
    setError(null);
    setFlowStep('finding_trade');
    try {
      const data = await findTradeApi(selectedCoin, prefs || {});
      setFindTradeData(data);
      setFlowStep('trade_result');
    } catch {
      setError('Trade check failed');
      setFlowStep('action');
    }
    setLoading(false);
  };

  const handlePreferencesConfirm = async (newPrefs: Prefs) => {
    setPrefs(newPrefs);
    setFlowStep('generating');
    setLoading(true);
    setError(null);
    try {
      await savePreferences(newPrefs);
      const targetSymbol = selectedCoin === 'BEST' ? 'BEST' : selectedCoin || symbol;
      const data = await generateSmartSignal(targetSymbol, newPrefs);
      setSignal(data);
      setFlowStep('signal');
    } catch {
      setError('Signal generation failed');
      setFlowStep('preferences');
    }
    setLoading(false);
  };

  const restartFlow = () => {
    setFlowStep('idle');
    setSelectedCoin(null);
    setSignal(null);
    setScanResult(null);
    setAnalysisData(null);
    setFindTradeData(null);
    setError(null);
  };

  const backToResults = () => {
    setSignal(null);
    setSelectedCoin(null);
    setScanResult(null);
    setFlowStep('results');
  };

  const goToPreferences = () => {
    setFlowStep('preferences');
  };

  const dismissAction = () => {
    setSelectedCoin(null);
    setFlowStep('idle');
  };

  const style = SIGNAL_STYLES[signal?.signal] || SIGNAL_STYLES.NO_TRADE;

  return (
    <div className="w-80 border-l border-border-primary bg-bg-secondary/30 flex flex-col shrink-0 overflow-hidden">
      <div className="flex border-b border-border-primary">
        {(['signal', 'backtest'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); restartFlow(); }}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === t ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-text-muted hover:text-text-secondary'}`}>
            {t === 'signal' ? 'AI Signal' : 'Backtest'}
          </button>
        ))}
      </div>

      {tab === 'signal' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {flowStep === 'idle' && (
            <div className="space-y-3">
              <div className="glass-card p-3 border-l-2 border-accent-blue">
                <div className="text-[10px] text-accent-blue font-semibold uppercase mb-1">AI Trading Assistant</div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Scan all markets for safe high-probability setups based on your trading preferences.
                  Click any coin from the ticker or header to analyze it.
                </p>
              </div>
              <button onClick={runSmartScan} disabled={loading}
                className="w-full py-2.5 rounded-lg bg-accent-blue/20 text-accent-blue text-xs font-bold hover:bg-accent-blue/30 transition-all disabled:opacity-50">
                {loading ? 'Scanning Markets...' : 'Start Market Scan'}
              </button>
            </div>
          )}

          {flowStep === 'scanning' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto mb-2" />
                <div className="text-xs text-text-muted">Scanning all exchanges...</div>
              </div>
            </div>
          )}

          {flowStep === 'results' && scanResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-text-muted">
                  {scanResult.qualified ?? scanResult.results.length} opportunities from {scanResult.scanned} coins
                </div>
                <button onClick={restartFlow} className="text-[9px] text-text-muted hover:text-text-secondary">Cancel</button>
              </div>

              <div className="space-y-1.5">
                {scanResult.results.slice(0, 8).map((r) => (
                  <div key={r.symbol}
                    className="glass-card p-2.5 hover:border-accent-blue/40 transition-all cursor-pointer group">
                    <div className="flex items-center justify-between mb-1">
                      <button onClick={() => selectCoin(r.symbol)} className="flex items-center gap-2 flex-1 text-left">
                        <span className="text-xs font-semibold">{r.symbol.replace('USDT', '')}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          r.trend === 'bullish' ? 'bg-accent-green/10 text-accent-green' :
                          r.trend === 'bearish' ? 'bg-accent-red/10 text-accent-red' :
                          'bg-bg-primary text-text-muted'
                        }`}>{r.trend}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue">{r.setup}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${r.opportunityScore >= 70 ? 'bg-accent-green' : r.opportunityScore >= 50 ? 'bg-accent-yellow' : 'bg-accent-red'}`}
                            style={{ width: `${r.opportunityScore}%` }} />
                        </div>
                        <span className={`text-[10px] font-mono font-bold ${r.opportunityScore >= 70 ? 'text-accent-green' : 'text-accent-yellow'}`}>{r.opportunityScore}</span>
                        <button onClick={() => generateDirect(r.symbol)}
                          className="text-[9px] px-2 py-1 rounded bg-accent-green/15 text-accent-green font-semibold hover:bg-accent-green/25 transition-all opacity-0 group-hover:opacity-100">
                          Generate
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-text-secondary">
                      <span>${formatPrice(r.price)}</span>
                      <span className={r.change24h >= 0 ? 'text-accent-green' : 'text-accent-red'}>{formatPercent(r.change24h)}</span>
                      <span className={`capitalize ${r.riskLevel === 'high' ? 'text-accent-red' : r.riskLevel === 'low' ? 'text-accent-green' : 'text-accent-yellow'}`}>{r.riskLevel}</span>
                      <span>RSI: {r.rsi || '-'}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[8px] text-text-muted">
                      <span>Trend: {r.trendStrength}/100</span>
                      <span>Vol: {r.volumeStrength}/100</span>
                      <span>Volatility: {r.volatility.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={generateBest}
                className="w-full py-2.5 rounded-lg bg-accent-green/20 text-accent-green text-xs font-bold hover:bg-accent-green/30 transition-all neon-green">
                Generate Best AI Signal
              </button>
            </div>
          )}

          {flowStep === 'action' && selectedCoin && (
            <CoinActionPanel
              symbol={selectedCoin}
              onAnalyze={handleAnalyzeCoin}
              onFindTrade={handleFindTrade}
              onGenerateSignal={() => setFlowStep('preferences')}
              onDismiss={dismissAction}
              onBackToMarketScan={dismissAction}
            />
          )}

          {flowStep === 'analyzing' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto mb-2" />
                <div className="text-xs text-text-muted">Analyzing {formatSymbol(selectedCoin || '')}...</div>
              </div>
            </div>
          )}

          {flowStep === 'analysis' && analysisData && selectedCoin && (
            <CoinAnalysis
              analysis={analysisData}
              coinSymbol={selectedCoin}
              onBack={() => setFlowStep('action')}
              onFindTrade={handleFindTrade}
              onGenerateSignal={() => setFlowStep('preferences')}
            />
          )}

          {flowStep === 'finding_trade' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin mx-auto mb-2" />
                <div className="text-xs text-text-muted">Checking for trade opportunity...</div>
              </div>
            </div>
          )}

          {flowStep === 'trade_result' && findTradeData && (
            <div className="space-y-3">
              {findTradeData.found ? (
                <div className="glass-card p-3 border-l-2 border-accent-green">
                  <div className="text-[10px] text-accent-green font-semibold uppercase mb-1">Trade Opportunity Found</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-text-primary">{formatSymbol(findTradeData.symbol)}</span>
                    {findTradeData.direction && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${findTradeData.direction === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
                        {findTradeData.direction}
                      </span>
                    )}
                    {findTradeData.confidence != null && (
                      <span className="text-[10px] font-mono font-bold text-accent-yellow">{findTradeData.confidence}%</span>
                    )}
                  </div>
                  {findTradeData.reasons && (
                    <p className="text-[10px] text-text-secondary leading-relaxed">
                      {Array.isArray(findTradeData.reasons) ? findTradeData.reasons.join(' ') : findTradeData.reasons}
                    </p>
                  )}
                  {findTradeData.entry && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      <div className="bg-bg-primary/50 rounded p-1.5">
                        <div className="text-[8px] text-text-muted">Entry</div>
                        <div className="text-[9px] font-mono text-text-primary">${formatPrice(findTradeData.entry.low)} - ${formatPrice(findTradeData.entry.high)}</div>
                      </div>
                      <div className="bg-bg-primary/50 rounded p-1.5">
                        <div className="text-[8px] text-text-muted">Stop Loss</div>
                        <div className="text-[9px] font-mono text-accent-red">${formatPrice(findTradeData.stopLoss!)}</div>
                      </div>
                      <div className="bg-bg-primary/50 rounded p-1.5">
                        <div className="text-[8px] text-text-muted">R:R</div>
                        <div className="text-[9px] font-mono text-accent-green">{findTradeData.rrRatio}:1</div>
                      </div>
                      <div className="bg-bg-primary/50 rounded p-1.5">
                        <div className="text-[8px] text-text-muted">Risk</div>
                        <div className="text-[9px] font-mono text-accent-yellow">{findTradeData.riskPercent}%</div>
                      </div>
                    </div>
                  )}
                  {findTradeData.tradeSuggestion && (
                    <div className={`mt-2 p-2 rounded text-[9px] border ${
                      findTradeData.tradeSuggestion.type === 'futures' ? 'bg-accent-purple/10 border-accent-purple/20' :
                      findTradeData.tradeSuggestion.type === 'spot' ? 'bg-accent-blue/10 border-accent-blue/20' :
                      'bg-accent-yellow/10 border-accent-yellow/20'
                    }`}>
                      <div className="font-semibold text-text-primary mb-0.5">
                        AI suggests: {findTradeData.tradeSuggestion.type.toUpperCase()}
                      </div>
                      <p className="text-text-secondary">{findTradeData.tradeSuggestion.reasoning}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-card p-3 border-l-2 border-accent-yellow">
                  <div className="text-[10px] text-accent-yellow font-semibold uppercase mb-1">No Safe High-Confidence Setup</div>
                  {findTradeData.reasons && (
                    <div className="space-y-0.5 mt-1">
                      {findTradeData.reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[9px] text-text-secondary">
                          <span className="text-accent-yellow mt-0.5">•</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {findTradeData.confirmations && (
                    <div className="mt-2 pt-2 border-t border-border-primary">
                      <div className="text-[8px] text-text-muted mb-1">Confirmations: {findTradeData.passedConfirmations}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {findTradeData.found && (
                  <>
                    <button onClick={goToPreferences}
                      className="flex-1 py-2 rounded-lg bg-accent-purple/20 text-accent-purple text-xs font-semibold hover:bg-accent-purple/30 transition-all">
                      Generate AI Signal
                    </button>
                    <button onClick={handleAnalyzeCoin}
                      className="flex-1 py-2 rounded-lg bg-accent-blue/20 text-accent-blue text-xs font-semibold hover:bg-accent-blue/30 transition-all">
                      View Analysis
                    </button>
                  </>
                )}
                <button onClick={() => setFlowStep('action')}
                  className="flex-1 py-2 rounded-lg bg-bg-primary/50 text-text-muted text-xs hover:text-text-secondary hover:bg-bg-primary/80 transition-all">
                  Back
                </button>
              </div>
              {!findTradeData.found && (
                <button onClick={goToPreferences}
                  className="w-full py-2 rounded-lg bg-accent-yellow/20 text-accent-yellow text-xs font-semibold hover:bg-accent-yellow/30 transition-all">
                  Configure Preferences & Try Again
                </button>
              )}
            </div>
          )}

          {flowStep === 'preferences' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-accent-blue font-semibold uppercase">Configure Trade</div>
                <button onClick={() => setFlowStep('action')} className="text-[9px] text-text-muted hover:text-text-secondary">Back</button>
              </div>
              {selectedCoin && selectedCoin !== 'BEST' && (
                <div className="glass-card p-2 border-l-2 border-accent-blue">
                  <div className="text-[9px] text-text-muted">Selected Coin</div>
                  <div className="text-xs font-bold text-accent-blue">{formatSymbol(selectedCoin)}</div>
                </div>
              )}
              {selectedCoin === 'BEST' && (
                <div className="glass-card p-2 border-l-2 border-accent-green">
                  <div className="text-[9px] text-text-muted">Mode</div>
                  <div className="text-xs font-bold text-accent-green">Best AI Signal (auto-select)</div>
                </div>
              )}
              <TradingPreferences
                initial={prefs || {}}
                onComplete={handlePreferencesConfirm}
              />
            </div>
          )}

          {flowStep === 'generating' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin mx-auto mb-2" />
                <div className="text-xs text-text-muted">Analyzing with your preferences...</div>
              </div>
            </div>
          )}

          {flowStep === 'signal' && signal && (
            <SignalResult signal={signal} style={style} onNewScan={restartFlow} onConfigure={goToPreferences} onBackToResults={backToResults} hasResults={!!scanResult} />
          )}

          {error && (
            <div className="glass-card p-3 border-l-2 border-accent-red">
              <div className="text-[10px] text-accent-red font-semibold mb-1">Error</div>
              <p className="text-xs text-text-secondary">{error}</p>
              <button onClick={restartFlow} className="mt-2 text-[10px] text-accent-blue hover:underline">Try again</button>
            </div>
          )}
        </div>
      )}

      {tab === 'backtest' && <BacktestPanel />}
    </div>
  );
}

function SignalResult({ signal, style, onNewScan, onConfigure, onBackToResults, hasResults }: any) {
  const isNoTrade = signal.signal === 'NO_TRADE';

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between p-3 rounded-lg ${style.bg} border ${style.border}`}>
        <div>
          <span className={`text-sm font-bold ${style.text}`}>{style.label}</span>
          {!isNoTrade && signal.direction && (
            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold ${
              signal.direction === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
            }`}>{signal.direction}</span>
          )}
        </div>
        {signal.confidence > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-14 h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${signal.confidence >= 75 ? 'bg-accent-green' : signal.confidence >= 50 ? 'bg-accent-yellow' : 'bg-accent-red'}`}
                style={{ width: `${signal.confidence}%` }} />
            </div>
            <span className="text-xs font-mono text-text-primary">{signal.confidence}%</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-text-muted">
        <span className="font-semibold text-text-primary">{formatSymbol(signal.symbol)}</span>
        <span className="px-1.5 py-0.5 rounded bg-bg-primary/50 capitalize">{signal.exchange}</span>
        <span className="px-1.5 py-0.5 rounded bg-bg-primary/50">{signal.tradingMode}</span>
        <span className="px-1.5 py-0.5 rounded bg-bg-primary/50">{signal.timeframe}</span>
      </div>

      {isNoTrade && signal.reason && (
        <div className="glass-card p-3 border-l-2 border-accent-yellow">
          <div className="text-[10px] text-accent-yellow font-semibold mb-1">MARKET ANALYSIS</div>
          <p className="text-xs text-text-secondary leading-relaxed">{signal.reason}</p>
          {signal.topCoins && signal.topCoins.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border-primary">
              <div className="text-[9px] text-text-muted mb-1">Top ranked coins (no confirmed setup):</div>
              {signal.topCoins.map((c: any) => (
                <div key={c.symbol} className="flex items-center gap-2 text-[9px] text-text-secondary">
                  <span>{c.symbol.replace('USDT', '')}</span>
                  <span className={`${c.trend === 'bullish' ? 'text-accent-green' : 'text-accent-red'}`}>{c.trend}</span>
                  <span className="text-text-muted">score: {c.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isNoTrade && (
        <>
          <div className="glass-card p-3">
            <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Trade Setup</div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <div className="bg-bg-primary/50 rounded p-2">
                <div className="text-[8px] text-text-muted">Entry Zone</div>
                <div className="text-[10px] font-mono text-text-primary">
                  ${formatPrice(signal.entryZone?.low)} - ${formatPrice(signal.entryZone?.high)}
                </div>
              </div>
              <div className="bg-bg-primary/50 rounded p-2">
                <div className="text-[8px] text-text-muted">Stop Loss</div>
                <div className="text-[10px] font-mono text-accent-red">${formatPrice(signal.stopLoss)}</div>
              </div>
              <div className="bg-bg-primary/50 rounded p-2">
                <div className="text-[8px] text-text-muted">TP1</div>
                <div className="text-[10px] font-mono text-accent-green">${formatPrice(signal.takeProfits?.tp1)}</div>
              </div>
              <div className="bg-bg-primary/50 rounded p-2">
                <div className="text-[8px] text-text-muted">TP2</div>
                <div className="text-[10px] font-mono text-accent-green">${formatPrice(signal.takeProfits?.tp2)}</div>
              </div>
              <div className="bg-bg-primary/50 rounded p-2 col-span-2">
                <div className="text-[8px] text-text-muted">TP3</div>
                <div className="text-[10px] font-mono text-accent-green">${formatPrice(signal.takeProfits?.tp3)}</div>
              </div>
            </div>
          </div>

          <div className="glass-card p-3">
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-text-muted">R:R Ratio</span>
                <div className={`font-mono font-bold text-sm ${signal.rrRatio >= 2 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {signal.rrRatio}:1
                </div>
              </div>
              <div>
                <span className="text-text-muted">Risk per Trade</span>
                <div className="font-mono font-bold text-sm text-accent-yellow">{signal.riskPercent}%</div>
              </div>
              <div>
                <span className="text-text-muted">Suggested Leverage</span>
                <div className="font-mono font-bold text-sm text-accent-blue">{signal.suggestedLeverage}x</div>
              </div>
              <div>
                <span className="text-text-muted">Risk Level</span>
                <div className={`font-mono font-bold text-sm capitalize ${
                  signal.riskLevel === 'safe' ? 'text-accent-green' : signal.riskLevel === 'aggressive' ? 'text-accent-red' : 'text-accent-yellow'
                }`}>{signal.riskLevel}</div>
              </div>
            </div>
          </div>

          {signal.confirmations && (
            <div className="glass-card p-3">
              <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">
                Confirmations ({signal.passedConfirmations})
              </div>
              <div className="space-y-1">
                {Object.entries(signal.confirmations).map(([key, conf]: [string, any]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${conf.passed ? 'bg-accent-green' : 'bg-accent-red'}`} />
                    <span className="text-[9px] text-text-secondary capitalize flex-1">{key}</span>
                    <span className={`text-[9px] font-medium ${conf.direction === 'bullish' ? 'text-accent-green' : conf.direction === 'bearish' ? 'text-accent-red' : 'text-text-muted'}`}>
                      {conf.direction}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {signal.mtf && (
            <div className="glass-card p-3">
              <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Timeframe Alignment</div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-accent-green">{signal.mtf.bullCount}B</span>
                <span className="text-xs text-accent-red">{signal.mtf.bearCount}Br</span>
                <span className="text-xs text-text-muted">{signal.mtf.neutralCount}N</span>
              </div>
              {signal.mtf.details && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(signal.mtf.details).map(([tf, dir]: [string, any]) => (
                    <span key={tf} className={`text-[8px] px-1.5 py-0.5 rounded ${dir === 'bullish' ? 'bg-accent-green/10 text-accent-green' : dir === 'bearish' ? 'bg-accent-red/10 text-accent-red' : 'bg-bg-primary text-text-muted'}`}>
                      {tf}: {dir}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {signal.explanation && (
            <div className="glass-card p-3">
              <div className="text-[10px] text-accent-blue font-semibold uppercase mb-2">AI Analysis</div>
              <p className="text-xs text-text-secondary leading-relaxed">{signal.explanation}</p>
            </div>
          )}

          {(signal.trendStrength > 0 || signal.volumeStrength > 0) && (
            <div className="glass-card p-3">
              <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">Signal Quality</div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[9px] text-text-muted mb-0.5">
                    <span>Trend Strength</span>
                    <span>{signal.trendStrength}/100</span>
                  </div>
                  <div className="w-full h-1 bg-bg-primary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent-blue" style={{ width: `${signal.trendStrength}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[9px] text-text-muted mb-0.5">
                    <span>Volume Strength</span>
                    <span>{signal.volumeStrength}/100</span>
                  </div>
                  <div className="w-full h-1 bg-bg-primary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent-purple" style={{ width: `${signal.volumeStrength}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        {hasResults && (
          <button onClick={onBackToResults}
            className="flex-1 py-2 rounded-lg bg-bg-primary/50 text-text-muted text-xs hover:text-text-secondary hover:bg-bg-primary/80 transition-all">
            Back to Results
          </button>
        )}
        {onConfigure && (
          <button onClick={onConfigure}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              isNoTrade
                ? 'bg-accent-yellow/20 text-accent-yellow hover:bg-accent-yellow/30'
                : 'bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30'
            }`}>
            {isNoTrade ? 'Configure & Try Again' : 'Configure & Regenerate'}
          </button>
        )}
        {onNewScan && (
          <button onClick={onNewScan}
            className="flex-1 py-2 rounded-lg bg-bg-primary/50 text-text-muted text-xs hover:text-text-secondary hover:bg-bg-primary/80 transition-all">
            New Market Scan
          </button>
        )}
      </div>
    </div>
  );
}
