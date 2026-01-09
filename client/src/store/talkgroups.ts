import { create } from 'zustand';
import type { Talkgroup } from '../types';
import { getTalkgroups } from '../services/api';

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
