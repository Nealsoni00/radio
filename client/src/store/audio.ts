import { create } from 'zustand';
import type { SDRConfig } from '../types';
import { getSDRConfig } from '../services/api';
import { AUDIO } from '../constants';

interface QueuedAudio {
  id: string;
  talkgroupId: number;
  alphaTag?: string;
  audioUrl: string;
  duration?: number;
}

interface AudioState {
  isLiveEnabled: boolean;
  isPlaying: boolean;
  currentTalkgroup: number | null;
  volume: number;
  streamingTalkgroups: Set<number>;
  audioQueue: QueuedAudio[];
  currentAudio: QueuedAudio | null;
  sdrConfig: SDRConfig | null;
  setLiveEnabled: (enabled: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTalkgroup: (tg: number | null) => void;
  setVolume: (volume: number) => void;
  toggleStreamingTalkgroup: (id: number) => void;
  setStreamingTalkgroups: (ids: number[]) => void;
  clearStreamingTalkgroups: () => void;
  streamAllTalkgroups: () => void;
  addToQueue: (audio: QueuedAudio) => void;
  playNext: () => QueuedAudio | null;
  clearQueue: () => void;
  setCurrentAudio: (audio: QueuedAudio | null) => void;
  fetchSDRConfig: () => Promise<void>;
  isInBand: (frequency: number) => boolean;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isLiveEnabled: false,
  isPlaying: false,
  currentTalkgroup: null,
  volume: AUDIO.DEFAULT_VOLUME,
  streamingTalkgroups: new Set(),
  audioQueue: [],
  currentAudio: null,
  sdrConfig: null,

  setLiveEnabled: (enabled) => set({ isLiveEnabled: enabled }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTalkgroup: (tg) => set({ currentTalkgroup: tg }),
  setVolume: (volume) => set({ volume }),

  toggleStreamingTalkgroup: (id) => {
    set((state) => {
      const newSet = new Set(state.streamingTalkgroups);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { streamingTalkgroups: newSet };
    });
  },

  setStreamingTalkgroups: (ids) => {
    set({ streamingTalkgroups: new Set(ids) });
  },

  clearStreamingTalkgroups: () => {
    set({ streamingTalkgroups: new Set() });
  },

  streamAllTalkgroups: () => {
    set({ streamingTalkgroups: new Set() });
  },

  addToQueue: (audio) => {
    set((state) => ({
      audioQueue: [...state.audioQueue, audio],
    }));
  },

  playNext: () => {
    const state = get();
    if (state.audioQueue.length === 0) {
      set({ currentAudio: null });
      return null;
    }
    const [next, ...rest] = state.audioQueue;
    set({ audioQueue: rest, currentAudio: next, isPlaying: true });
    return next;
  },

  clearQueue: () => {
    set({ audioQueue: [], currentAudio: null });
  },

  setCurrentAudio: (audio) => {
    set({ currentAudio: audio });
  },

  fetchSDRConfig: async () => {
    try {
      const config = await getSDRConfig();
      set({ sdrConfig: config });
    } catch {
      // Ignore errors
    }
  },

  isInBand: (frequency) => {
    const { sdrConfig } = get();
    if (!sdrConfig) return true;
    return frequency >= sdrConfig.minFrequency && frequency <= sdrConfig.maxFrequency;
  },
}));

export type { QueuedAudio };
