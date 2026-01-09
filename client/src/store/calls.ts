import { create } from 'zustand';
import type { Call } from '../types';
import { getCalls } from '../services/api';
import { LIMITS } from '../constants';

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
    const isActive = call.isActive ?? true;
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
      isActive,
    };

    set((state) => ({
      calls: [fullCall, ...state.calls].slice(0, LIMITS.MAX_CALLS),
      activeCalls: isActive ? [...state.activeCalls, fullCall] : state.activeCalls,
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
