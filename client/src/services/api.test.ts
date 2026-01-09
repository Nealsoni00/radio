import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAudioUrl } from './api';

// Mock fetch for API tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAudioUrl', () => {
    it('should return correct audio URL for a call ID', () => {
      const url = getAudioUrl('call_001');
      expect(url).toBe('/api/audio/call_001');
    });

    it('should handle special characters in call ID', () => {
      const url = getAudioUrl('call-with-dashes_123');
      expect(url).toBe('/api/audio/call-with-dashes_123');
    });
  });

  describe('getCalls', () => {
    it('should fetch calls with default parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ calls: [] }),
      });

      const { getCalls } = await import('./api');
      await getCalls();

      expect(mockFetch).toHaveBeenCalledWith('/api/calls');
    });

    it('should include query parameters when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ calls: [] }),
      });

      const { getCalls } = await import('./api');
      await getCalls({ limit: 10, offset: 20, talkgroup: 3219 });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('limit=10');
      expect(callUrl).toContain('offset=20');
      expect(callUrl).toContain('talkgroup=3219');
    });

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { getCalls } = await import('./api');
      await expect(getCalls()).rejects.toThrow('Failed to fetch calls');
    });
  });

  describe('getCall', () => {
    it('should fetch a single call by ID', async () => {
      const mockCall = {
        call: { id: 'call_001', talkgroup_id: 3219 },
        sources: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCall,
      });

      const { getCall } = await import('./api');
      const result = await getCall('call_001');

      expect(mockFetch).toHaveBeenCalledWith('/api/calls/call_001');
      expect(result.call.id).toBe('call_001');
    });
  });

  describe('getTalkgroups', () => {
    it('should fetch all talkgroups', async () => {
      const mockTalkgroups = {
        talkgroups: [
          { id: 3219, alpha_tag: 'PHX PD DISP 1' },
          { id: 4567, alpha_tag: 'PHX FIRE DISP' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTalkgroups,
      });

      const { getTalkgroups } = await import('./api');
      const result = await getTalkgroups();

      expect(mockFetch).toHaveBeenCalledWith('/api/talkgroups');
      expect(result.talkgroups).toHaveLength(2);
    });
  });

  describe('getHealth', () => {
    it('should fetch health status', async () => {
      const mockHealth = {
        status: 'ok',
        timestamp: Date.now(),
        trunkRecorder: true,
        audioReceiver: true,
        clients: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      });

      const { getHealth } = await import('./api');
      const result = await getHealth();

      expect(mockFetch).toHaveBeenCalledWith('/api/health');
      expect(result.status).toBe('ok');
      expect(result.trunkRecorder).toBe(true);
    });
  });

  describe('getSDRConfig', () => {
    it('should fetch SDR configuration', async () => {
      const mockConfig = {
        centerFrequency: 770500000,
        sampleRate: 2400000,
        minFrequency: 769300000,
        maxFrequency: 771700000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      });

      const { getSDRConfig } = await import('./api');
      const result = await getSDRConfig();

      expect(mockFetch).toHaveBeenCalledWith('/api/sdr');
      expect(result.centerFrequency).toBe(770500000);
    });
  });

  describe('getControlChannelEvents', () => {
    it('should fetch control channel events', async () => {
      const mockEvents = {
        events: [
          { timestamp: '2026-01-09T12:00:00.000Z', type: 'grant', message: 'Test' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      const { getControlChannelEvents } = await import('./api');
      const result = await getControlChannelEvents();

      expect(mockFetch).toHaveBeenCalledWith('/api/control-channel');
      expect(result.events).toHaveLength(1);
    });

    it('should include count parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [] }),
      });

      const { getControlChannelEvents } = await import('./api');
      await getControlChannelEvents(50);

      expect(mockFetch).toHaveBeenCalledWith('/api/control-channel?count=50');
    });
  });
});
