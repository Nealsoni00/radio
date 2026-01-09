import { create } from 'zustand';
import type { FFTData } from '../types';

export type ColorScheme = 'viridis' | 'plasma' | 'grayscale' | 'classic';

interface FFTState {
  // Streaming state
  isEnabled: boolean;
  currentFFT: FFTData | null;

  // Waterfall history (ring buffer)
  waterfallHistory: Float32Array[];
  waterfallMaxRows: number;
  updateCount: number; // Increments on each new FFT packet

  // Display settings
  minDb: number;
  maxDb: number;
  colorScheme: ColorScheme;
  showWaterfall: boolean;
  showSpectrum: boolean;

  // Actions
  setEnabled: (enabled: boolean) => void;
  updateFFT: (data: FFTData) => void;
  setMinDb: (db: number) => void;
  setMaxDb: (db: number) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleWaterfall: () => void;
  toggleSpectrum: () => void;
  clearHistory: () => void;
}

export const useFFTStore = create<FFTState>((set, get) => ({
  isEnabled: false,
  currentFFT: null,
  waterfallHistory: [],
  waterfallMaxRows: 256,
  updateCount: 0,
  minDb: -120,
  maxDb: -20,
  colorScheme: 'viridis',
  showWaterfall: true,
  showSpectrum: true,

  setEnabled: (enabled) => set({ isEnabled: enabled }),

  updateFFT: (data) => {
    const { waterfallHistory, waterfallMaxRows, minDb, maxDb } = get();
    const newHistory = [...waterfallHistory, data.magnitudes];
    if (newHistory.length > waterfallMaxRows) {
      newHistory.shift();
    }

    // Auto-scale: calculate min/max from actual data
    let dataMin = Infinity, dataMax = -Infinity;
    for (let i = 0; i < data.magnitudes.length; i++) {
      const v = data.magnitudes[i];
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }

    // Only update if we have valid data and it's significantly different
    // Use a smoothed approach to avoid jitter
    const newMinDb = Math.min(minDb, dataMin - 5);
    const newMaxDb = Math.max(maxDb, dataMax + 5);

    // If first data or range is way off, reset to match data
    const currentRange = maxDb - minDb;
    const dataRange = dataMax - dataMin;
    const needsReset = waterfallHistory.length === 0 ||
      dataMin < minDb - currentRange ||
      dataMax > maxDb + currentRange;

    if (needsReset && dataRange > 0) {
      set((state) => ({
        currentFFT: data,
        waterfallHistory: newHistory,
        minDb: dataMin - 10,
        maxDb: dataMax + 10,
        updateCount: state.updateCount + 1,
      }));
    } else {
      set((state) => ({ currentFFT: data, waterfallHistory: newHistory, updateCount: state.updateCount + 1 }));
    }
  },

  setMinDb: (db) => set({ minDb: db }),
  setMaxDb: (db) => set({ maxDb: db }),
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  toggleWaterfall: () => set((s) => ({ showWaterfall: !s.showWaterfall })),
  toggleSpectrum: () => set((s) => ({ showSpectrum: !s.showSpectrum })),

  clearHistory: () => set({ waterfallHistory: [], currentFFT: null, updateCount: 0 }),
}));
