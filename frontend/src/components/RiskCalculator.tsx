import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { formatPrice } from '../utils/format';

export function RiskCalculator() {
  const { symbol } = useAppStore();
  const [balance, setBalance] = useState('10000');
  const [riskPct, setRiskPct] = useState('2');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [atr, setAtr] = useState('');
  const [result, setResult] = useState<any>(null);

  const calculate = async () => {
    const res = await fetch('/api/risk/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balance: parseFloat(balance), riskPercent: parseFloat(riskPct),
        entryPrice: parseFloat(entry), stopLoss: parseFloat(sl),
        leverage, side, atr: atr ? parseFloat(atr) : null,
      }),
    });
    setResult(await res.json());
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="glass p-4">
        <h3 className="text-sm font-semibold mb-3">Risk Calculator — {symbol}</h3>

        <div className="flex gap-2 mb-3">
          <button onClick={() => setSide('long')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${side === 'long' ? 'bg-accent-green/20 text-accent-green' : 'bg-bg-tertiary text-text-muted'}`}>LONG</button>
          <button onClick={() => setSide('short')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${side === 'short' ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-tertiary text-text-muted'}`}>SHORT</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="Balance ($)" value={balance} onChange={setBalance} />
          <Field label="Risk %" value={riskPct} onChange={setRiskPct} />
          <Field label="Entry Price" value={entry} onChange={setEntry} />
          <Field label="Stop Loss" value={sl} onChange={setSl} />
          <Field label="ATR (optional)" value={atr} onChange={setAtr} />
          <div>
            <label className="text-[10px] text-text-muted mb-1 block">Leverage: {leverage}x</label>
            <input type="range" min={1} max={50} value={leverage} onChange={e => setLeverage(parseInt(e.target.value))} className="w-full accent-accent-green" />
          </div>
        </div>

        <button onClick={calculate} className="w-full py-2 rounded-lg bg-accent-green/20 text-accent-green text-xs font-bold hover:bg-accent-green/30 transition-all">
          Calculate
        </button>
      </div>

      {result && !result.error && (
        <div className="glass p-4 space-y-3">
          <h3 className="text-xs font-semibold">Results</h3>
          <div className="grid grid-cols-2 gap-2">
            <ResultCard label="Position Size" value={result.positionSize?.toFixed(6)} />
            <ResultCard label="Position Value" value={`$${result.positionValue?.toLocaleString()}`} />
            <ResultCard label="Margin Required" value={`$${result.margin?.toLocaleString()}`} />
            <ResultCard label="Risk Amount" value={`$${result.riskAmount?.toLocaleString()}`} />
            <ResultCard label="Liquidation Price" value={formatPrice(result.liquidationPrice)} danger />
            <ResultCard label="Recommended Lev" value={`${result.recommendedLeverage}x`} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs"><span className="text-text-muted">TP1 (1:1.5)</span><span className="font-mono text-accent-green">{formatPrice(result.takeProfits?.tp1)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">TP2 (1:2.5)</span><span className="font-mono text-accent-green">{formatPrice(result.takeProfits?.tp2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-muted">TP3 (1:4)</span><span className="font-mono text-accent-green">{formatPrice(result.takeProfits?.tp3)}</span></div>
          </div>

          {result.warnings?.length > 0 && (
            <div className="space-y-1">
              {result.warnings.map((w: string, i: number) => (
                <div key={i} className="text-[10px] text-accent-yellow flex items-center gap-1">
                  <span>⚠</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: any) {
  return (
    <div>
      <label className="text-[10px] text-text-muted mb-1 block">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-bg-primary border border-border-primary rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-green/30" />
    </div>
  );
}

function ResultCard({ label, value, danger }: any) {
  return (
    <div className="bg-bg-primary/50 rounded-lg p-2">
      <div className="text-[9px] text-text-muted">{label}</div>
      <div className={`text-xs font-mono font-bold ${danger ? 'text-accent-red' : 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
