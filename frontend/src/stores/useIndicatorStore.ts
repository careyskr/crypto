import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IndicatorConfig {
  enabled: boolean;
  color: string;
  lineWidth?: number;
}

interface IndicatorState {
  overlays: {
    ema9: IndicatorConfig;
    ema20: IndicatorConfig;
    ema50: IndicatorConfig;
    sma20: IndicatorConfig;
    sma50: IndicatorConfig;
    sma200: IndicatorConfig;
    bb: IndicatorConfig;
    keltner: IndicatorConfig;
  };
  oscillators: {
    rsi: IndicatorConfig;
    macd: IndicatorConfig;
    stochastic: IndicatorConfig;
    adx: IndicatorConfig;
    obv: IndicatorConfig;
    atr: IndicatorConfig;
    volumeSma: IndicatorConfig;
  };
  toggleOverlay: (key: keyof IndicatorState['overlays']) => void;
  toggleOscillator: (key: keyof IndicatorState['oscillators']) => void;
  isOverlayEnabled: (key: keyof IndicatorState['overlays']) => boolean;
  isOscillatorEnabled: (key: keyof IndicatorState['oscillators']) => boolean;
  getEnabledOverlays: () => string[];
  getEnabledOscillators: () => string[];
}

export const useIndicatorStore = create<IndicatorState>()(
  persist(
    (set, get) => ({
      overlays: {
        ema9: { enabled: true, color: '#00C2FF' },
        ema20: { enabled: true, color: '#FFD700' },
        ema50: { enabled: false, color: '#A855F7' },
        sma20: { enabled: false, color: '#FF6B6B' },
        sma50: { enabled: false, color: '#4ECDC4' },
        sma200: { enabled: false, color: '#FF9FF3' },
        bb: { enabled: true, color: 'rgba(168, 85, 247, 0.4)', lineWidth: 1 },
        keltner: { enabled: false, color: 'rgba(0, 194, 255, 0.3)', lineWidth: 1 },
      },
      oscillators: {
        rsi: { enabled: true, color: '#A855F7' },
        macd: { enabled: true, color: '#00C2FF' },
        stochastic: { enabled: false, color: '#FFD700' },
        adx: { enabled: false, color: '#FF6B6B' },
        obv: { enabled: false, color: '#4ECDC4' },
        atr: { enabled: false, color: '#FF9FF3' },
        volumeSma: { enabled: false, color: '#00FF88' },
      },

      toggleOverlay: (key) =>
        set((s) => ({
          overlays: { ...s.overlays, [key]: { ...s.overlays[key], enabled: !s.overlays[key].enabled } },
        })),
      toggleOscillator: (key) =>
        set((s) => ({
          oscillators: { ...s.oscillators, [key]: { ...s.oscillators[key], enabled: !s.oscillators[key].enabled } },
        })),
      isOverlayEnabled: (key) => get().overlays[key].enabled,
      isOscillatorEnabled: (key) => get().oscillators[key].enabled,
      getEnabledOverlays: () =>
        Object.entries(get().overlays).filter(([, v]) => v.enabled).map(([k]) => k),
      getEnabledOscillators: () =>
        Object.entries(get().oscillators).filter(([, v]) => v.enabled).map(([k]) => k),
    }),
    { name: 'crypto-indicators-store' }
  )
);
