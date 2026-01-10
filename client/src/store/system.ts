import { create } from 'zustand';
import {
  getActiveSystem,
  switchToSystem as apiSwitchToSystem,
  stopSystem as apiStopSystem,
  type ActiveSystemInfo,
} from '../services/api';

const STORAGE_KEY = 'radio-active-system-id';

// Get persisted system ID from localStorage
function getPersistedSystemId(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const id = parseInt(stored, 10);
      return isNaN(id) ? null : id;
    }
  } catch {
    // localStorage may not be available
  }
  return null;
}

// Persist system ID to localStorage
function persistSystemId(systemId: number | null): void {
  try {
    if (systemId !== null) {
      localStorage.setItem(STORAGE_KEY, systemId.toString());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage may not be available
  }
}

interface SystemState {
  // Active system
  activeSystem: ActiveSystemInfo | null;
  isSwitching: boolean;
  error: string | null;

  // Actions
  fetchActiveSystem: () => Promise<void>;
  switchToSystem: (systemId: number) => Promise<boolean>;
  stopSystem: () => Promise<void>;
  setActiveSystem: (system: ActiveSystemInfo | null) => void;
  clearError: () => void;
  restorePersistedSystem: () => Promise<void>;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  activeSystem: null,
  isSwitching: false,
  error: null,

  fetchActiveSystem: async () => {
    try {
      const status = await getActiveSystem();
      set({ activeSystem: status.system });
      // Persist the active system ID
      if (status.system) {
        persistSystemId(status.system.id);
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  switchToSystem: async (systemId: number) => {
    set({ isSwitching: true, error: null });
    try {
      const result = await apiSwitchToSystem(systemId);
      set({ activeSystem: result.system, isSwitching: false });
      // Persist the active system ID
      persistSystemId(result.system.id);
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isSwitching: false });
      return false;
    }
  },

  stopSystem: async () => {
    try {
      await apiStopSystem();
      set({ activeSystem: null });
      // Clear persisted system
      persistSystemId(null);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  setActiveSystem: (system: ActiveSystemInfo | null) => {
    set({ activeSystem: system });
    // Persist the active system ID
    persistSystemId(system?.id ?? null);
  },

  clearError: () => {
    set({ error: null });
  },

  // Restore the last active system from localStorage
  restorePersistedSystem: async () => {
    const { activeSystem, isSwitching, switchToSystem } = get();

    // Don't restore if we already have an active system or are switching
    if (activeSystem || isSwitching) return;

    const persistedId = getPersistedSystemId();
    if (persistedId !== null) {
      console.log('[SystemStore] Restoring persisted system:', persistedId);
      await switchToSystem(persistedId);
    }
  },
}));
