import { create } from 'zustand';
import type { RRState, RRCounty, RRSystem, RRSite, RRFrequency, RRTalkgroup, RRStats } from '../types';
import {
  getRRStates,
  getRRCounties,
  getRRSystems,
  getRRSystem,
  searchRR,
  getSelectedSystems,
  addSelectedSystem as apiAddSelectedSystem,
  removeSelectedSystem as apiRemoveSelectedSystem,
  getRRStats,
} from '../services/api';

interface SystemDetails {
  system: RRSystem;
  sites: RRSite[];
  frequencies: RRFrequency[];
  talkgroups: RRTalkgroup[];
  talkgroupCount: number;
}

interface RadioReferenceState {
  // Geographic navigation
  states: RRState[];
  selectedStateId: number | null;
  counties: RRCounty[];
  selectedCountyId: number | null;

  // Systems
  systems: RRSystem[];
  systemsTotal: number;
  selectedSystemId: number | null;
  systemDetails: SystemDetails | null;

  // Search
  searchQuery: string;
  searchResults: { systems: RRSystem[]; talkgroups: RRTalkgroup[] } | null;
  isSearching: boolean;

  // Filters
  typeFilter: string;

  // User selections
  selectedSystems: RRSystem[];

  // Stats
  stats: RRStats | null;

  // Loading states
  isLoading: boolean;
  isLoadingDetails: boolean;
  error: string | null;

  // Actions
  fetchStates: () => Promise<void>;
  selectState: (stateId: number | null) => Promise<void>;
  selectCounty: (countyId: number | null) => Promise<void>;
  fetchSystems: (options?: { reset?: boolean }) => Promise<void>;
  loadMoreSystems: () => Promise<void>;
  selectSystem: (systemId: number | null) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  setTypeFilter: (filter: string) => void;
  addSelectedSystem: (systemId: number) => Promise<void>;
  removeSelectedSystem: (systemId: number) => Promise<void>;
  fetchSelectedSystems: () => Promise<void>;
  fetchStats: () => Promise<void>;
}

export const useRadioReferenceStore = create<RadioReferenceState>((set, get) => ({
  // Initial state
  states: [],
  selectedStateId: null,
  counties: [],
  selectedCountyId: null,
  systems: [],
  systemsTotal: 0,
  selectedSystemId: null,
  systemDetails: null,
  searchQuery: '',
  searchResults: null,
  isSearching: false,
  typeFilter: 'P25',
  selectedSystems: [],
  stats: null,
  isLoading: false,
  isLoadingDetails: false,
  error: null,

  fetchStates: async () => {
    set({ isLoading: true, error: null });
    try {
      const { states } = await getRRStates();
      set({ states, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  selectState: async (stateId: number | null) => {
    set({
      selectedStateId: stateId,
      selectedCountyId: null,
      counties: [],
      systems: [],
      systemsTotal: 0,
      selectedSystemId: null,
      systemDetails: null,
    });

    if (stateId) {
      set({ isLoading: true });
      try {
        const { counties } = await getRRCounties(stateId);
        set({ counties, isLoading: false });
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }

      // Also fetch systems for this state
      await get().fetchSystems({ reset: true });
    }
  },

  selectCounty: async (countyId: number | null) => {
    set({
      selectedCountyId: countyId,
      systems: [],
      systemsTotal: 0,
      selectedSystemId: null,
      systemDetails: null,
    });

    await get().fetchSystems({ reset: true });
  },

  fetchSystems: async (options?: { reset?: boolean }) => {
    const { selectedStateId, selectedCountyId, typeFilter, systems } = get();
    const offset = options?.reset ? 0 : systems.length;

    set({ isLoading: true, error: null });
    try {
      const { systems: newSystems, total } = await getRRSystems({
        state: selectedStateId ?? undefined,
        county: selectedCountyId ?? undefined,
        type: typeFilter || undefined,
        limit: 50,
        offset,
      });

      set({
        systems: options?.reset ? newSystems : [...systems, ...newSystems],
        systemsTotal: total,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  loadMoreSystems: async () => {
    const { systems, systemsTotal, isLoading } = get();
    if (isLoading || systems.length >= systemsTotal) return;
    await get().fetchSystems();
  },

  selectSystem: async (systemId: number | null) => {
    set({ selectedSystemId: systemId, systemDetails: null });

    if (systemId) {
      set({ isLoadingDetails: true });
      try {
        const details = await getRRSystem(systemId);
        set({ systemDetails: details, isLoadingDetails: false });
      } catch (err) {
        set({ error: (err as Error).message, isLoadingDetails: false });
      }
    }
  },

  search: async (query: string) => {
    set({ searchQuery: query });

    if (query.length < 2) {
      set({ searchResults: null, isSearching: false });
      return;
    }

    set({ isSearching: true });
    try {
      const { selectedStateId, typeFilter } = get();
      const results = await searchRR(query, {
        state: selectedStateId ?? undefined,
        type: typeFilter || undefined,
        limit: 30,
      });
      set({
        searchResults: { systems: results.systems, talkgroups: results.talkgroups as RRTalkgroup[] },
        isSearching: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isSearching: false });
    }
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: null });
  },

  setTypeFilter: (filter: string) => {
    set({ typeFilter: filter, systems: [], systemsTotal: 0 });
    get().fetchSystems({ reset: true });
  },

  addSelectedSystem: async (systemId: number) => {
    try {
      await apiAddSelectedSystem(systemId);
      await get().fetchSelectedSystems();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  removeSelectedSystem: async (systemId: number) => {
    try {
      await apiRemoveSelectedSystem(systemId);
      await get().fetchSelectedSystems();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchSelectedSystems: async () => {
    try {
      const { systems } = await getSelectedSystems();
      set({ selectedSystems: systems });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchStats: async () => {
    try {
      const { stats } = await getRRStats();
      set({ stats });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
