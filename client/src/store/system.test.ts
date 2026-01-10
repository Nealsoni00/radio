import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSystemStore } from './system';

// Mock the API functions
vi.mock('../services/api', () => ({
  getActiveSystem: vi.fn(),
  switchToSystem: vi.fn(),
  stopSystem: vi.fn(),
  getSystemStatus: vi.fn(),
}));

import { getActiveSystem, switchToSystem, stopSystem } from '../services/api';

const mockActiveSystem = {
  id: 6758,
  name: 'San Francisco County/City P25 Trunking System',
  shortName: 'san-francisco-co',
  type: 'P25 Phase II',
  stateAbbrev: 'CA',
  countyName: 'San Francisco',
  centerFrequency: 851993750,
  bandwidth: 2400000,
  controlChannels: [851150000, 851250000, 851400000],
  modulation: 'qpsk',
};

describe('useSystemStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSystemStore.setState({
      activeSystem: null,
      isSwitching: false,
      error: null,
    });
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('setActiveSystem', () => {
    it('should set the active system', () => {
      const { setActiveSystem } = useSystemStore.getState();

      setActiveSystem(mockActiveSystem);

      const { activeSystem } = useSystemStore.getState();
      expect(activeSystem).toEqual(mockActiveSystem);
    });

    it('should set active system to null', () => {
      // First set a system
      useSystemStore.setState({ activeSystem: mockActiveSystem });

      const { setActiveSystem } = useSystemStore.getState();
      setActiveSystem(null);

      const { activeSystem } = useSystemStore.getState();
      expect(activeSystem).toBeNull();
    });
  });

  describe('fetchActiveSystem', () => {
    it('should fetch and set the active system from API', async () => {
      vi.mocked(getActiveSystem).mockResolvedValue({
        active: true,
        system: mockActiveSystem,
      });

      const { fetchActiveSystem } = useSystemStore.getState();
      await fetchActiveSystem();

      const { activeSystem, error } = useSystemStore.getState();
      expect(activeSystem).toEqual(mockActiveSystem);
      expect(error).toBeNull();
      expect(getActiveSystem).toHaveBeenCalledTimes(1);
    });

    it('should handle API error', async () => {
      vi.mocked(getActiveSystem).mockRejectedValue(new Error('Network error'));

      const { fetchActiveSystem } = useSystemStore.getState();
      await fetchActiveSystem();

      const { activeSystem, error } = useSystemStore.getState();
      expect(activeSystem).toBeNull();
      expect(error).toBe('Network error');
    });

    it('should set null when no active system', async () => {
      vi.mocked(getActiveSystem).mockResolvedValue({
        active: false,
        system: null,
      });

      const { fetchActiveSystem } = useSystemStore.getState();
      await fetchActiveSystem();

      const { activeSystem } = useSystemStore.getState();
      expect(activeSystem).toBeNull();
    });
  });

  describe('switchToSystem', () => {
    it('should switch to a new system', async () => {
      vi.mocked(switchToSystem).mockResolvedValue({
        success: true,
        system: mockActiveSystem,
      });

      const { switchToSystem: storeSwitchToSystem } = useSystemStore.getState();

      // Check isSwitching is initially false
      expect(useSystemStore.getState().isSwitching).toBe(false);

      const resultPromise = storeSwitchToSystem(6758);

      // Should be switching while API call is in progress
      expect(useSystemStore.getState().isSwitching).toBe(true);

      const result = await resultPromise;

      const { activeSystem, isSwitching, error } = useSystemStore.getState();
      expect(result).toBe(true);
      expect(activeSystem).toEqual(mockActiveSystem);
      expect(isSwitching).toBe(false);
      expect(error).toBeNull();
      expect(switchToSystem).toHaveBeenCalledWith(6758);
    });

    it('should handle switch error', async () => {
      vi.mocked(switchToSystem).mockRejectedValue(new Error('Failed to switch'));

      const { switchToSystem: storeSwitchToSystem } = useSystemStore.getState();
      const result = await storeSwitchToSystem(9999);

      const { activeSystem, isSwitching, error } = useSystemStore.getState();
      expect(result).toBe(false);
      expect(activeSystem).toBeNull();
      expect(isSwitching).toBe(false);
      expect(error).toBe('Failed to switch');
    });

    it('should clear previous error when switching', async () => {
      // Set an error first
      useSystemStore.setState({ error: 'Previous error' });

      vi.mocked(switchToSystem).mockResolvedValue({
        success: true,
        system: mockActiveSystem,
      });

      const { switchToSystem: storeSwitchToSystem } = useSystemStore.getState();
      await storeSwitchToSystem(6758);

      const { error } = useSystemStore.getState();
      expect(error).toBeNull();
    });
  });

  describe('stopSystem', () => {
    it('should stop the system and clear activeSystem', async () => {
      // First set an active system
      useSystemStore.setState({ activeSystem: mockActiveSystem });

      vi.mocked(stopSystem).mockResolvedValue({ success: true });

      const { stopSystem: storeStopSystem } = useSystemStore.getState();
      await storeStopSystem();

      const { activeSystem } = useSystemStore.getState();
      expect(activeSystem).toBeNull();
      expect(stopSystem).toHaveBeenCalledTimes(1);
    });

    it('should handle stop error', async () => {
      useSystemStore.setState({ activeSystem: mockActiveSystem });

      vi.mocked(stopSystem).mockRejectedValue(new Error('Stop failed'));

      const { stopSystem: storeStopSystem } = useSystemStore.getState();
      await storeStopSystem();

      const { activeSystem, error } = useSystemStore.getState();
      // activeSystem should still be set (not cleared on error)
      expect(activeSystem).toEqual(mockActiveSystem);
      expect(error).toBe('Stop failed');
    });
  });

  describe('clearError', () => {
    it('should clear the error', () => {
      useSystemStore.setState({ error: 'Some error' });

      const { clearError } = useSystemStore.getState();
      clearError();

      const { error } = useSystemStore.getState();
      expect(error).toBeNull();
    });
  });

  describe('WebSocket systemChanged handling', () => {
    it('should update activeSystem when systemChanged message is received', () => {
      // This tests that setActiveSystem works correctly when called from WebSocket handler
      const { setActiveSystem } = useSystemStore.getState();

      // Simulate WebSocket systemChanged message
      setActiveSystem(mockActiveSystem);

      const { activeSystem } = useSystemStore.getState();
      expect(activeSystem).toEqual(mockActiveSystem);
      expect(activeSystem?.name).toBe('San Francisco County/City P25 Trunking System');
    });

    it('should handle system deactivation via WebSocket', () => {
      // Set initial active system
      useSystemStore.setState({ activeSystem: mockActiveSystem });

      const { setActiveSystem } = useSystemStore.getState();

      // Simulate WebSocket systemChanged with null (system stopped)
      setActiveSystem(null);

      const { activeSystem } = useSystemStore.getState();
      expect(activeSystem).toBeNull();
    });
  });
});
