import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { searchSymbols } from '../utils/binanceApi';

export function SearchModal() {
  const { setSearchOpen, setSymbol } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; baseAsset: string; quoteAsset: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchSymbols(query);
        setResults(data);
      } catch {}
      setLoading(false);
    }, 200);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setSearchOpen]);

  const select = (symbol: string) => {
    setSymbol(symbol);
    setSearchOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setSearchOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg glass-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search trading pairs (e.g. BTC, ETH, SOL)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-bg-primary border border-border-primary rounded-lg pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-text-muted text-sm">
              <div className="w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mr-2" />
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && query.length > 0 && (
            <div className="text-center py-8 text-text-muted text-sm">No results found</div>
          )}

          {results.map((r) => (
            <button
              key={r.symbol}
              onClick={() => select(r.symbol)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-tertiary/50 rounded-lg transition-colors text-left"
            >
              <div>
                <div className="text-sm font-medium text-text-primary">{r.baseAsset}</div>
                <div className="text-xs text-text-muted">{r.symbol}</div>
              </div>
              <span className="text-xs text-accent-blue font-mono">USDT</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
