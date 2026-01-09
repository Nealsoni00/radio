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
  minDb: -120,
  maxDb: -20,
  colorScheme: 'viridis',
  showWaterfall: true,
  showSpectrum: true,

  setEnabled: (enabled) => set({ isEnabled: enabled }),

  updateFFT: (data) => {
    const { waterfallHistory, waterfallMaxRows } = get();
    const newHistory = [...waterfallHistory, data.magnitudes];
    if (newHistory.length > waterfallMaxRows) {
      newHistory.shift();
    }
    set({ currentFFT: data, waterfallHistory: newHistory });
  },

  setMinDb: (db) => set({ minDb: db }),
  setMaxDb: (db) => set({ maxDb: db }),
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  toggleWaterfall: () => set((s) => ({ showWaterfall: !s.showWaterfall })),
  toggleSpectrum: () => set((s) => ({ showSpectrum: !s.showSpectrum })),

  clearHistory: () => set({ waterfallHistory: [], currentFFT: null }),
}));
