import { create } from 'zustand';
import type { Call, Talkgroup } from '../types';
import { getCalls, getTalkgroups } from '../services/api';

interface CallsState {
  calls: Call[];
  activeCalls: Call[];
  selectedCall: Call | null;
  isLoading: boolean;
  error: string | null;
  fetchCalls: (params?: { limit?: number; offset?: number }) => Promise<void>;
  addCall: (call: Partial<Call>) => void;
  updateCall: (id: string, updates: Partial<Call>) => void;
  setActiveCalls: (calls: Partial<Call>[]) => void;
  selectCall: (call: Call | null) => void;
}

export const useCallsStore = create<CallsState>((set) => ({
  calls: [],
  activeCalls: [],
  selectedCall: null,
  isLoading: false,
  error: null,

  fetchCalls: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { calls } = await getCalls(params);
      set({ calls, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  addCall: (call) => {
    const fullCall: Call = {
      id: call.id || '',
      talkgroup_id: call.talkgroup_id || 0,
      frequency: call.frequency || 0,
      start_time: call.start_time || Math.floor(Date.now() / 1000),
      stop_time: call.stop_time ?? null,
      duration: call.duration ?? null,
      emergency: call.emergency || false,
      encrypted: call.encrypted || false,
      audio_file: call.audio_file ?? null,
      audio_type: call.audio_type ?? null,
      alpha_tag: call.alpha_tag,
      group_name: call.group_name,
      group_tag: call.group_tag,
      isActive: true,
    };

    set((state) => ({
      calls: [fullCall, ...state.calls].slice(0, 500),
      activeCalls: [...state.activeCalls, fullCall],
    }));
  },

  updateCall: (id, updates) => {
    set((state) => ({
      calls: state.calls.map((c) => (c.id === id ? { ...c, ...updates, isActive: false } : c)),
      activeCalls: state.activeCalls.filter((c) => c.id !== id),
    }));
  },

  setActiveCalls: (calls) => {
    const activeCalls = calls.map((c) => ({
      id: c.id || '',
      talkgroup_id: c.talkgroup_id || 0,
      frequency: c.frequency || 0,
      start_time: c.start_time || 0,
      stop_time: null,
      duration: null,
      emergency: c.emergency || false,
      encrypted: c.encrypted || false,
      audio_file: null,
      audio_type: null,
      alpha_tag: c.alpha_tag,
      isActive: true,
    })) as Call[];
    set({ activeCalls });
  },

  selectCall: (call) => {
    set({ selectedCall: call });
  },
}));

interface TalkgroupsState {
  talkgroups: Talkgroup[];
  selectedTalkgroups: Set<number>;
  groupFilter: string | null;
  searchQuery: string;
  isLoading: boolean;
  fetchTalkgroups: () => Promise<void>;
  toggleTalkgroup: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setGroupFilter: (group: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export const useTalkgroupsStore = create<TalkgroupsState>((set) => ({
  talkgroups: [],
  selectedTalkgroups: new Set(),
  groupFilter: null,
  searchQuery: '',
  isLoading: false,

  fetchTalkgroups: async () => {
    set({ isLoading: true });
    try {
      const { talkgroups } = await getTalkgroups();
      set({ talkgroups, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  toggleTalkgroup: (id) => {
    set((state) => {
      const newSet = new Set(state.selectedTalkgroups);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedTalkgroups: newSet };
    });
  },

  selectAll: () => {
    set({ selectedTalkgroups: new Set() });
  },

  clearSelection: () => {
    set((state) => ({
      selectedTalkgroups: new Set(state.talkgroups.map((tg) => tg.id)),
    }));
  },

  setGroupFilter: (group) => {
    set({ groupFilter: group });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
}));

interface AudioState {
  isLiveEnabled: boolean;
  isPlaying: boolean;
  currentTalkgroup: number | null;
  volume: number;
  setLiveEnabled: (enabled: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTalkgroup: (tg: number | null) => void;
  setVolume: (volume: number) => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  isLiveEnabled: false,
  isPlaying: false,
  currentTalkgroup: null,
  volume: 0.8,

  setLiveEnabled: (enabled) => set({ isLiveEnabled: enabled }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTalkgroup: (tg) => set({ currentTalkgroup: tg }),
  setVolume: (volume) => set({ volume }),
}));

interface ConnectionState {
  isConnected: boolean;
  trunkRecorderConnected: boolean;
  decodeRate: number;
  setConnected: (connected: boolean) => void;
  setTrunkRecorderConnected: (connected: boolean) => void;
  setDecodeRate: (rate: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  trunkRecorderConnected: false,
  decodeRate: 0,

  setConnected: (connected) => set({ isConnected: connected }),
  setTrunkRecorderConnected: (connected) => set({ trunkRecorderConnected: connected }),
  setDecodeRate: (rate) => set({ decodeRate: rate }),
}));
