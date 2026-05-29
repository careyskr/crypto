import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, HistogramData,
  ColorType, Time, LineStyle,
} from 'lightweight-charts';
import { useAppStore } from '../stores/useAppStore';
import { useIndicatorStore } from '../stores/useIndicatorStore';
import { fetchExchangeKlines, fetchExchangeTicker } from '../utils/api';
import { fetchIndicators } from '../utils/indicatorsApi';
import { formatPrice, formatPercent, formatVolume, formatSymbol } from '../utils/format';
import type { Ticker } from '../types';
import type { IndicatorsData } from '../types/indicators';

export function ChartPanel() {
  const { symbol, interval, exchange } = useAppStore();
  const { overlays, oscillators, getEnabledOverlays, getEnabledOscillators } = useIndicatorStore();

  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);
  const stochChartRef = useRef<HTMLDivElement>(null);
  const adxChartRef = useRef<HTMLDivElement>(null);

  const mainChartApiRef = useRef<IChartApi | null>(null);
  const rsiChartApiRef = useRef<IChartApi | null>(null);
  const macdChartApiRef = useRef<IChartApi | null>(null);
  const stochChartApiRef = useRef<IChartApi | null>(null);
  const adxChartApiRef = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesRefs = useRef<Map<string, ISeriesApi<any>[]>>(new Map());

  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [loading, setLoading] = useState(true);
  const [srEnabled, setSrEnabled] = useState(false);

  const klinesRef = useRef<any[]>([]);
  const srPriceLinesRef = useRef<any[]>([]);

  const clearSR = useCallback(() => {
    srPriceLinesRef.current.forEach(pl => candleSeriesRef.current?.removePriceLine(pl));
    srPriceLinesRef.current = [];
  }, []);

  const detectSRZones = useCallback((data: any[], currentPrice?: number) => {
    const result = { resistances: [] as { price: number; count: number; touches: number; score: number }[], supports: [] as { price: number; count: number; touches: number; score: number }[] };
    if (data.length < 20) return result;
    const len = data.length;
    const current = currentPrice || data[len - 1]?.close || 0;
    if (!current) return result;

    const levels: { price: number }[] = [];
    for (let i = 2; i < len - 2; i++) {
      const h = data[i].high;
      const l = data[i].low;
      if (h >= data[i-2].high && h >= data[i-1].high && h >= data[i+1].high && h >= data[i+2].high) levels.push({ price: h });
      if (l <= data[i-2].low && l <= data[i-1].low && l <= data[i+1].low && l <= data[i+2].low) levels.push({ price: l });
    }

    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const zones: { price: number; count: number }[] = [];
    for (const l of sorted) {
      const match = zones.find(z => Math.abs(l.price - z.price) / z.price * 100 < 0.2);
      if (match) { match.price = (match.price * match.count + l.price) / (match.count + 1); match.count++; }
      else zones.push({ price: l.price, count: 1 });
    }

    const scored = zones.map(z => {
      let touches = 0;
      for (const c of data) {
        if (Math.abs(c.high - z.price) / z.price * 100 < 0.2 || Math.abs(c.low - z.price) / z.price * 100 < 0.2) touches++;
      }
      const distPct = Math.abs(z.price - current) / current;
      const score = touches * 2 + z.count * 2 - distPct * 3;
      return { ...z, touches, score };
    });

    const above = scored.filter(z => z.price > current);
    const below = scored.filter(z => z.price < current);

    const pick = (items: typeof scored) => {
      const byScore = [...items].sort((a, b) => b.score - a.score).slice(0, 8);
      return byScore.sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current)).slice(0, 2);
    };

    result.resistances = pick(above).sort((a, b) => a.price - b.price);
    result.supports = pick(below).sort((a, b) => b.price - a.price);

    return result;
  }, []);

  const drawSR = useCallback((data: any[]) => {
    if (!candleSeriesRef.current) return;
    clearSR();
    const currentPrice = data[data.length - 1]?.close || 0;
    const { resistances, supports } = detectSRZones(data, currentPrice);

    const draw = (items: typeof resistances, prefix: string, color: string) => {
      items.forEach((z, i) => {
        const isStrong = z.count >= 3 || z.touches >= 5 || (items.length > 1 && z.score > (items[1]?.score || 0) * 1.5);
        const pl = candleSeriesRef.current!.createPriceLine({
          price: z.price, color, lineWidth: 4, lineStyle: 0,
          axisLabelVisible: true, title: `${prefix}${i + 1}${isStrong ? ' Strong' : ''}`,
        });
        srPriceLinesRef.current.push(pl);
      });
    };

    draw(resistances, 'R', 'rgba(255, 51, 102, 0.6)');
    draw(supports, 'S', 'rgba(0, 255, 136, 0.6)');
  }, [clearSR, detectSRZones]);

  const toggleSR = useCallback(() => {
    if (srEnabled) {
      clearSR();
      setSrEnabled(false);
    } else {
      setSrEnabled(true);
      if (klinesRef.current.length > 0) drawSR(klinesRef.current);
    }
  }, [srEnabled, clearSR, drawSR]);

  // Direct Binance WebSocket for kline data
  const klineWsRef = useRef<WebSocket | null>(null);
  const klineReconnectRef = useRef<NodeJS.Timeout>();
  const currentCandleTimeRef = useRef<number>(0);

  const setupSubChart = useCallback((
    containerRef: React.RefObject<HTMLDivElement>,
    chartApiRef: React.MutableRefObject<IChartApi | null>,
    height: number
  ) => {
    if (!containerRef.current) return null;
    if (chartApiRef.current) {
      chartApiRef.current.remove();
      chartApiRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9CA3AF', fontFamily: "'Inter', sans-serif", fontSize: 10 },
      grid: { vertLines: { color: 'rgba(255, 255, 255, 0.03)' }, horzLines: { color: 'rgba(255, 255, 255, 0.03)' } },
      crosshair: { mode: 0, vertLine: { color: 'rgba(0, 194, 255, 0.4)', width: 1, style: 2, labelBackgroundColor: '#00C2FF' }, horzLine: { color: 'rgba(0, 194, 255, 0.4)', width: 1, style: 2, labelBackgroundColor: '#00C2FF' } },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.06)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { visible: false },
      handleScroll: { vertTouchDrag: false },
    });

    chartApiRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return chart;
  }, []);

  // Initialize main chart
  useEffect(() => {
    if (!mainChartRef.current) return;

    const chart = createChart(mainChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(0, 194, 255, 0.4)', width: 1, style: 2, labelBackgroundColor: '#00C2FF' },
        horzLine: { color: 'rgba(0, 194, 255, 0.4)', width: 1, style: 2, labelBackgroundColor: '#00C2FF' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00FF88',
      downColor: '#FF3366',
      borderDownColor: '#FF3366',
      borderUpColor: '#00FF88',
      wickDownColor: '#FF3366',
      wickUpColor: '#00FF88',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    mainChartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (mainChartRef.current) {
        chart.applyOptions({ width: mainChartRef.current.clientWidth, height: mainChartRef.current.clientHeight });
      }
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(mainChartRef.current);
    handleResize();

    return () => {
      observer.disconnect();
      chart.remove();
      mainChartApiRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlaySeriesRefs.current.clear();
    };
  }, []);

  // Load kline data
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const load = async () => {
      try {
        const [klines, tickerData, indicators] = await Promise.all([
          fetchExchangeKlines(exchange, symbol, interval, 500),
          fetchExchangeTicker(exchange, symbol),
          fetchIndicators(symbol, interval, 500),
        ]);

        if (!mounted) return;
        setTicker(tickerData);

        if (candleSeriesRef.current && volumeSeriesRef.current) {
          const candleData: CandlestickData[] = klines.map((k: any) => ({
            time: k.time as Time,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
          }));
          const volumeData: HistogramData[] = klines.map((k: any) => ({
            time: k.time as Time,
            value: k.volume,
            color: k.close >= k.open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)',
          }));

          candleSeriesRef.current.setData(candleData);
          volumeSeriesRef.current.setData(volumeData);
          klinesRef.current = candleData;
          if (srEnabled) setTimeout(() => drawSR(candleData), 100);

          // Track current candle time
          if (klines.length > 0) {
            currentCandleTimeRef.current = klines[klines.length - 1].time;
          }

          mainChartApiRef.current?.timeScale().fitContent();
        }

        // Clear old overlay series
        for (const seriesArr of overlaySeriesRefs.current.values()) {
          for (const s of seriesArr) {
            mainChartApiRef.current?.removeSeries(s);
          }
        }
        overlaySeriesRefs.current.clear();

        // Add overlay indicators
        const enabledOverlays = getEnabledOverlays();
        const o = indicators as IndicatorsData;

        const addOverlayLine = (key: string, data: { time: number; value: number }[], color: string, width = 1, style = LineStyle.Solid) => {
          if (!mainChartApiRef.current) return;
          const series = mainChartApiRef.current.addLineSeries({
            color, lineWidth: width as any, priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: false, lineStyle: style,
          });
          series.setData(data.map(d => ({ time: d.time as Time, value: d.value })));
          if (!overlaySeriesRefs.current.has(key)) overlaySeriesRefs.current.set(key, []);
          overlaySeriesRefs.current.get(key)!.push(series);
        };

        if (enabledOverlays.includes('ema9')) addOverlayLine('ema9', o.ema9, '#00C2FF');
        if (enabledOverlays.includes('ema20')) addOverlayLine('ema20', o.ema20, '#FFD700');
        if (enabledOverlays.includes('ema50')) addOverlayLine('ema50', o.ema50, '#A855F7');
        if (enabledOverlays.includes('sma20')) addOverlayLine('sma20', o.sma20, '#FF6B6B');
        if (enabledOverlays.includes('sma50')) addOverlayLine('sma50', o.sma50, '#4ECDC4');
        if (enabledOverlays.includes('sma200')) addOverlayLine('sma200', o.sma200, '#FF9FF3');

        if (enabledOverlays.includes('bb')) {
          addOverlayLine('bbUpper', o.bbUpper, 'rgba(168, 85, 247, 0.5)', 1, LineStyle.Dashed);
          addOverlayLine('bbMiddle', o.bbMiddle, 'rgba(168, 85, 247, 0.6)', 1);
          addOverlayLine('bbLower', o.bbLower, 'rgba(168, 85, 247, 0.5)', 1, LineStyle.Dashed);
        }

        if (enabledOverlays.includes('keltner')) {
          addOverlayLine('kcUpper', o.keltnerUpper, 'rgba(0, 194, 255, 0.4)', 1, LineStyle.Dotted);
          addOverlayLine('kcMiddle', o.keltnerMiddle, 'rgba(0, 194, 255, 0.5)', 1);
          addOverlayLine('kcLower', o.keltnerLower, 'rgba(0, 194, 255, 0.4)', 1, LineStyle.Dotted);
        }

        // Oscillator sub-charts
        const enabledOscillators = getEnabledOscillators();

        if (rsiChartRef.current && enabledOscillators.includes('rsi')) {
          const chart = setupSubChart(rsiChartRef, rsiChartApiRef, 120);
          if (chart) {
            const rsiSeries = chart.addLineSeries({ color: '#A855F7', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
            rsiSeries.setData(o.rsi.map(d => ({ time: d.time as Time, value: d.value })));
            const obLine = chart.addLineSeries({ color: 'rgba(255, 51, 102, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            obLine.setData(o.rsi.map(d => ({ time: d.time as Time, value: 70 })));
            const osLine = chart.addLineSeries({ color: 'rgba(0, 255, 136, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            osLine.setData(o.rsi.map(d => ({ time: d.time as Time, value: 30 })));
            chart.timeScale().fitContent();
          }
        } else if (rsiChartApiRef.current) { rsiChartApiRef.current.remove(); rsiChartApiRef.current = null; }

        if (macdChartRef.current && enabledOscillators.includes('macd')) {
          const chart = setupSubChart(macdChartRef, macdChartApiRef, 120);
          if (chart) {
            const macdLine = chart.addLineSeries({ color: '#00C2FF', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
            macdLine.setData(o.macd.map(d => ({ time: d.time as Time, value: d.value })));
            const signalLine = chart.addLineSeries({ color: '#FF3366', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            signalLine.setData(o.macdSignal.map(d => ({ time: d.time as Time, value: d.value })));
            const histSeries = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
            histSeries.setData(o.macdHist.map(d => ({ time: d.time as Time, value: d.value, color: d.value >= 0 ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 51, 102, 0.5)' })));
            chart.timeScale().fitContent();
          }
        } else if (macdChartApiRef.current) { macdChartApiRef.current.remove(); macdChartApiRef.current = null; }

        if (stochChartRef.current && enabledOscillators.includes('stochastic')) {
          const chart = setupSubChart(stochChartRef, stochChartApiRef, 120);
          if (chart) {
            const kLine = chart.addLineSeries({ color: '#FFD700', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
            kLine.setData(o.stochK.map(d => ({ time: d.time as Time, value: d.value })));
            const dLine = chart.addLineSeries({ color: '#FF6B6B', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            dLine.setData(o.stochD.map(d => ({ time: d.time as Time, value: d.value })));
            chart.timeScale().fitContent();
          }
        } else if (stochChartApiRef.current) { stochChartApiRef.current.remove(); stochChartApiRef.current = null; }

        if (adxChartRef.current && enabledOscillators.includes('adx')) {
          const chart = setupSubChart(adxChartRef, adxChartApiRef, 120);
          if (chart) {
            const adxLine = chart.addLineSeries({ color: '#FF6B6B', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
            adxLine.setData(o.adx.map(d => ({ time: d.time as Time, value: d.value })));
            const plusLine = chart.addLineSeries({ color: '#00FF88', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            plusLine.setData(o.adxPlus.map(d => ({ time: d.time as Time, value: d.value })));
            const minusLine = chart.addLineSeries({ color: '#FF3366', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            minusLine.setData(o.adxMinus.map(d => ({ time: d.time as Time, value: d.value })));
            chart.timeScale().fitContent();
          }
        } else if (adxChartApiRef.current) { adxChartApiRef.current.remove(); adxChartApiRef.current = null; }

        mainChartApiRef.current?.timeScale().fitContent();
        setLoading(false);
      } catch (err) {
        console.error('Failed to load chart data:', err);
        setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [symbol, interval, exchange, overlays, oscillators, getEnabledOverlays, getEnabledOscillators, setupSubChart, srEnabled, drawSR]);

  // Direct Binance WebSocket for real-time kline updates
  useEffect(() => {
    if (exchange !== 'binance') return;

    let cancelled = false;

    const intervalMap: Record<string, string> = {
      '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
      '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
      '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M',
    };

    const wsInterval = intervalMap[interval] || '1h';
    const streamName = `${symbol.toLowerCase()}@kline_${wsInterval}`;

    const connect = () => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);
      klineWsRef.current = ws;

      ws.onopen = () => { if (!cancelled) console.log(`Chart WS connected: ${streamName}`); };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.e === 'kline') {
            const k = msg.k;
            const candleTime = k.t / 1000;
            const open = parseFloat(k.o);
            const high = parseFloat(k.h);
            const low = parseFloat(k.l);
            const close = parseFloat(k.c);
            const volume = parseFloat(k.v);
            const isFinal = k.x;

            if (candleSeriesRef.current) {
              candleSeriesRef.current.update({
                time: candleTime as Time,
                open, high, low, close,
              });
            }

            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.update({
                time: candleTime as Time,
                value: volume,
                color: close >= open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)',
              });
            }

            setTicker(prev => prev ? { ...prev, lastPrice: close } : null);

            // Redraw SR zones on candle close
            if (isFinal && srEnabled && klinesRef.current.length > 0) {
              const updated = [...klinesRef.current.slice(0, -1), { time: candleTime, open, high, low, close, volume }];
              klinesRef.current = updated;
              setTimeout(() => drawSR(updated), 50);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!cancelled) {
          console.log('Chart WS disconnected, reconnecting...');
          klineReconnectRef.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (klineWsRef.current) klineWsRef.current.close();
      if (klineReconnectRef.current) clearTimeout(klineReconnectRef.current);
    };
  }, [symbol, interval, exchange, srEnabled, drawSR]);

  // Ticker WebSocket for price display
  useEffect(() => {
    if (exchange !== 'binance') return;

    let cancelled = false;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const d = JSON.parse(event.data);
        if (d.s === symbol) {
          setTicker({
            symbol: d.s,
            lastPrice: parseFloat(d.c),
            priceChange: parseFloat(d.p),
            priceChangePercent: parseFloat(d.P),
            volume: parseFloat(d.v),
            quoteVolume: parseFloat(d.q),
            highPrice: parseFloat(d.h),
            lowPrice: parseFloat(d.l),
            count: parseInt(d.n),
          });
        }
      } catch {}
    };

    ws.onerror = () => ws.close();

    return () => { cancelled = true; ws.close(); };
  }, [symbol, exchange]);

  // Fallback periodic refresh for non-Binance exchanges
  useEffect(() => {
    if (exchange === 'binance') return;

    const refreshKlines = async () => {
      try {
        const klines = await fetchExchangeKlines(exchange, symbol, interval, 50);
        if (klines.length > 0 && candleSeriesRef.current && volumeSeriesRef.current) {
          const recent = klines.slice(-5);
          for (const k of recent) {
            candleSeriesRef.current.update({
              time: k.time as Time, open: k.open, high: k.high, low: k.low, close: k.close,
            });
            volumeSeriesRef.current.update({
              time: k.time as Time, value: k.volume,
              color: k.close >= k.open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)',
            });
          }
        }
      } catch {}
    };

    const intervalId = setInterval(refreshKlines, 5000);
    return () => clearInterval(intervalId);
  }, [symbol, interval, exchange]);

  const isUp = ticker ? ticker.priceChangePercent >= 0 : true;
  const showRsi = oscillators.rsi.enabled;
  const showMacd = oscillators.macd.enabled;
  const showStoch = oscillators.stochastic.enabled;
  const showAdx = oscillators.adx.enabled;
  const hasOscillators = showRsi || showMacd || showStoch || showAdx;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chart header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-bg-secondary/30">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold font-mono">{formatSymbol(symbol)}</h2>
          {ticker && (
            <>
              <span className={`text-xl font-mono font-bold ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                {formatPrice(ticker.lastPrice)}
              </span>
              <span className={`text-sm font-mono font-medium ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                {formatPercent(ticker.priceChangePercent)}
              </span>
              <div className="hidden lg:flex items-center gap-4 text-xs">
                <span className="text-text-muted">24h H <span className="text-text-primary font-mono">{formatPrice(ticker.highPrice)}</span></span>
                <span className="text-text-muted">24h L <span className="text-text-primary font-mono">{formatPrice(ticker.lowPrice)}</span></span>
                <span className="text-text-muted">Vol <span className="text-text-primary font-mono">{formatVolume(ticker.quoteVolume)}</span></span>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1">
            {['1m', '15m', '1h', '4h', '1d'].map((tf) => (
              <button key={tf} onClick={() => useAppStore.getState().setInterval(tf as any)}
                className={`px-2 py-1 text-[10px] font-medium rounded ${interval === tf ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary bg-bg-tertiary'}`}>{tf}</button>
            ))}
          </div>
          <button onClick={toggleSR}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-all shrink-0 ${
              srEnabled ? 'bg-accent-purple/20 text-accent-purple shadow-[0_0_8px_rgba(139,92,246,0.2)]' : 'text-text-muted hover:text-text-secondary bg-bg-tertiary'
            }`}>Auto S/R</button>
          <div className="w-px h-4 bg-border-primary mx-1" />
          <button onClick={() => mainChartApiRef.current?.timeScale().fitContent()}
            className="px-2 py-1 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-all" title="Reset Zoom">⟲</button>
          <button onClick={() => { const ts = mainChartApiRef.current?.timeScale(); if (!ts) return; const r = ts.getVisibleRange(); if (!r) return; const mid = (Number(r.from) + Number(r.to)) / 2; const span = Number(r.to) - Number(r.from); ts.setVisibleRange({ from: mid - span * 0.65, to: mid + span * 0.65 } as any); }}
            className="px-2 py-1 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-all" title="Zoom Out">−</button>
          <button onClick={() => { const ts = mainChartApiRef.current?.timeScale(); if (!ts) return; const r = ts.getVisibleRange(); if (!r) return; const mid = (Number(r.from) + Number(r.to)) / 2; const span = Number(r.to) - Number(r.from); ts.setVisibleRange({ from: mid - span * 1.35, to: mid + span * 1.35 } as any); }}
            className="px-2 py-1 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-all" title="Zoom In">+</button>
        </div>
      </div>

      {/* Main chart area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className={`${hasOscillators ? 'flex-[3]' : 'flex-1'} relative min-h-0`}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 z-10">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Loading...</span>
              </div>
            </div>
          )}
          <div ref={mainChartRef} className="w-full h-full chart-container" />
        </div>

        {hasOscillators && (
          <div className="flex-[1] min-h-[120px] border-t border-border-primary overflow-auto">
            {showRsi && <div ref={rsiChartRef} className="w-full h-[120px] border-b border-border-primary" />}
            {showMacd && <div ref={macdChartRef} className="w-full h-[120px] border-b border-border-primary" />}
            {showStoch && <div ref={stochChartRef} className="w-full h-[120px] border-b border-border-primary" />}
            {showAdx && <div ref={adxChartRef} className="w-full h-[120px]" />}
          </div>
        )}
      </div>
    </div>
  );
}
