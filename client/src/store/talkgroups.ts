import { create } from 'zustand';
import type { Talkgroup } from '../types';
import { getTalkgroups } from '../services/api';

// Filter mode: 'all' shows everything, 'none' hides everything, 'custom' uses selectedTalkgroups
type FilterMode = 'all' | 'none' | 'custom';

interface TalkgroupsState {
  talkgroups: Talkgroup[];
  selectedTalkgroups: Set<number>;
  filterMode: FilterMode;
  groupFilter: string | null;
  searchQuery: string;
  isLoading: boolean;
  activeSystemId: number | null;
  fetchTalkgroupsForSystem: (systemId: number) => Promise<void>;
  clearTalkgroups: () => void;
  toggleTalkgroup: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setGroupFilter: (group: string | null) => void;
  setSearchQuery: (query: string) => void;
  isVisible: (talkgroupId: number) => boolean;
}

export const useTalkgroupsStore = create<TalkgroupsState>((set, get) => ({
  talkgroups: [],
  selectedTalkgroups: new Set(),
  filterMode: 'all' as FilterMode,
  groupFilter: null,
  searchQuery: '',
  isLoading: false,
  activeSystemId: null,

  fetchTalkgroupsForSystem: async (systemId: number) => {
    // Don't refetch if already loaded for this system
    if (get().activeSystemId === systemId && get().talkgroups.length > 0) {
      return;
    }

    set({ isLoading: true, activeSystemId: systemId });
    try {
      // Fetch talkgroups from local database (populated by trunk-recorder)
      const { talkgroups } = await getTalkgroups();
      set({ talkgroups, isLoading: false, selectedTalkgroups: new Set(), filterMode: 'all' });
    } catch (err) {
      console.error('Failed to fetch talkgroups:', err);
      set({ isLoading: false });
    }
  },

  clearTalkgroups: () => {
    set({ talkgroups: [], activeSystemId: null, selectedTalkgroups: new Set(), filterMode: 'all' });
  },

  toggleTalkgroup: (id) => {
    set((state) => {
      const newSet = new Set(state.selectedTalkgroups);
      // When toggling, switch to custom mode
      if (state.filterMode === 'all') {
        // Going from "all visible" - start with all selected, then toggle off
        state.talkgroups.forEach(tg => newSet.add(tg.id));
        newSet.delete(id);
      } else if (state.filterMode === 'none') {
        // Going from "none visible" - start empty, then toggle on
        newSet.clear();
        newSet.add(id);
      } else {
        // Already in custom mode
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      }
      return { selectedTalkgroups: newSet, filterMode: 'custom' };
    });
  },

  selectAll: () => {
    set({ filterMode: 'all', selectedTalkgroups: new Set() });
  },

  clearSelection: () => {
    set({ filterMode: 'none', selectedTalkgroups: new Set() });
  },

  setGroupFilter: (group) => {
    set({ groupFilter: group });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  isVisible: (talkgroupId: number) => {
    const { filterMode, selectedTalkgroups } = get();
    if (filterMode === 'all') return true;
    if (filterMode === 'none') return false;
    return selectedTalkgroups.has(talkgroupId);
  },
}));
