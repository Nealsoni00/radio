import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAudioStore } from './audio';
import type { QueuedAudio } from './audio';

/**
 * Live Audio Streaming Store Tests
 *
 * These tests verify the audio store functionality for:
 * - Live streaming enable/disable
 * - Talkgroup subscription management
 * - Audio queue management (for recorded playback)
 * - SDR configuration and in-band frequency checks
 * - Live stream info tracking
 */

describe('useAudioStore - Live Streaming', () => {
  beforeEach(() => {
    useAudioStore.setState({
      isLiveEnabled: true,
      isPlaying: false,
      currentTalkgroup: null,
      volume: 0.8,
      streamingTalkgroups: new Set(),
      audioQueue: [],
      currentAudio: null,
      sdrConfig: null,
      liveStream: null,
    });
  });

  describe('Live Enable/Disable', () => {
    it('should default to live enabled', () => {
      expect(useAudioStore.getState().isLiveEnabled).toBe(true);
    });

    it('should enable live streaming', () => {
      useAudioStore.getState().setLiveEnabled(false);
      expect(useAudioStore.getState().isLiveEnabled).toBe(false);

      useAudioStore.getState().setLiveEnabled(true);
      expect(useAudioStore.getState().isLiveEnabled).toBe(true);
    });

    it('should disable live streaming', () => {
      useAudioStore.getState().setLiveEnabled(false);
      expect(useAudioStore.getState().isLiveEnabled).toBe(false);
    });

    it('should toggle live enabled multiple times', () => {
      const { setLiveEnabled } = useAudioStore.getState();

      setLiveEnabled(true);
      setLiveEnabled(false);
      setLiveEnabled(true);
      setLiveEnabled(false);

      expect(useAudioStore.getState().isLiveEnabled).toBe(false);
    });
  });

  describe('Playing State', () => {
    it('should track playing state', () => {
      const { setPlaying } = useAudioStore.getState();

      setPlaying(true);
      expect(useAudioStore.getState().isPlaying).toBe(true);

      setPlaying(false);
      expect(useAudioStore.getState().isPlaying).toBe(false);
    });

    it('should set current talkgroup when playing', () => {
      const { setCurrentTalkgroup } = useAudioStore.getState();

      setCurrentTalkgroup(927);
      expect(useAudioStore.getState().currentTalkgroup).toBe(927);

      setCurrentTalkgroup(null);
      expect(useAudioStore.getState().currentTalkgroup).toBeNull();
    });
  });

  describe('Volume Control', () => {
    it('should set volume', () => {
      const { setVolume } = useAudioStore.getState();

      setVolume(0.5);
      expect(useAudioStore.getState().volume).toBe(0.5);

      setVolume(1.0);
      expect(useAudioStore.getState().volume).toBe(1.0);

      setVolume(0);
      expect(useAudioStore.getState().volume).toBe(0);
    });
  });

  describe('Talkgroup Subscription', () => {
    it('should toggle streaming talkgroup on', () => {
      const { toggleStreamingTalkgroup } = useAudioStore.getState();

      toggleStreamingTalkgroup(927);
      expect(useAudioStore.getState().streamingTalkgroups.has(927)).toBe(true);
    });

    it('should toggle streaming talkgroup off', () => {
      const { toggleStreamingTalkgroup } = useAudioStore.getState();

      toggleStreamingTalkgroup(927);
      toggleStreamingTalkgroup(927);
      expect(useAudioStore.getState().streamingTalkgroups.has(927)).toBe(false);
    });

    it('should handle multiple talkgroup subscriptions', () => {
      const { toggleStreamingTalkgroup } = useAudioStore.getState();

      toggleStreamingTalkgroup(927);
      toggleStreamingTalkgroup(928);
      toggleStreamingTalkgroup(929);

      const { streamingTalkgroups } = useAudioStore.getState();
      expect(streamingTalkgroups.has(927)).toBe(true);
      expect(streamingTalkgroups.has(928)).toBe(true);
      expect(streamingTalkgroups.has(929)).toBe(true);
      expect(streamingTalkgroups.size).toBe(3);
    });

    it('should set specific streaming talkgroups', () => {
      const { setStreamingTalkgroups } = useAudioStore.getState();

      setStreamingTalkgroups([100, 200, 300]);

      const { streamingTalkgroups } = useAudioStore.getState();
      expect(streamingTalkgroups.has(100)).toBe(true);
      expect(streamingTalkgroups.has(200)).toBe(true);
      expect(streamingTalkgroups.has(300)).toBe(true);
      expect(streamingTalkgroups.size).toBe(3);
    });

    it('should clear streaming talkgroups (set to muted state)', () => {
      const { toggleStreamingTalkgroup, clearStreamingTalkgroups } = useAudioStore.getState();

      toggleStreamingTalkgroup(927);
      toggleStreamingTalkgroup(928);

      clearStreamingTalkgroups();

      const { streamingTalkgroups } = useAudioStore.getState();
      // -1 is sentinel value for "none selected"
      expect(streamingTalkgroups.has(-1)).toBe(true);
      expect(streamingTalkgroups.has(927)).toBe(false);
    });

    it('should stream all talkgroups (empty set)', () => {
      const { toggleStreamingTalkgroup, streamAllTalkgroups } = useAudioStore.getState();

      toggleStreamingTalkgroup(927);
      toggleStreamingTalkgroup(928);

      streamAllTalkgroups();

      const { streamingTalkgroups } = useAudioStore.getState();
      expect(streamingTalkgroups.size).toBe(0);
    });

    it('empty set should mean all talkgroups subscribed', () => {
      // This tests the convention: empty set = subscribed to all
      const { streamingTalkgroups } = useAudioStore.getState();
      expect(streamingTalkgroups.size).toBe(0);
      // Empty set means all - logic should check size === 0 || has(tgId)
    });
  });
});

describe('useAudioStore - Audio Queue', () => {
  beforeEach(() => {
    useAudioStore.setState({
      isLiveEnabled: true,
      isPlaying: false,
      currentTalkgroup: null,
      volume: 0.8,
      streamingTalkgroups: new Set(),
      audioQueue: [],
      currentAudio: null,
      sdrConfig: null,
      liveStream: null,
    });
  });

  describe('Queue Management', () => {
    it('should add audio to queue', () => {
      const { addToQueue } = useAudioStore.getState();

      addToQueue({
        id: 'call_001',
        talkgroupId: 927,
        audioUrl: '/api/audio/call_001',
      });

      expect(useAudioStore.getState().audioQueue).toHaveLength(1);
      expect(useAudioStore.getState().audioQueue[0].id).toBe('call_001');
    });

    it('should add multiple items to queue in order', () => {
      const { addToQueue } = useAudioStore.getState();

      addToQueue({ id: 'call_001', talkgroupId: 927, audioUrl: '/api/audio/call_001' });
      addToQueue({ id: 'call_002', talkgroupId: 928, audioUrl: '/api/audio/call_002' });
      addToQueue({ id: 'call_003', talkgroupId: 929, audioUrl: '/api/audio/call_003' });

      const { audioQueue } = useAudioStore.getState();
      expect(audioQueue).toHaveLength(3);
      expect(audioQueue[0].id).toBe('call_001');
      expect(audioQueue[1].id).toBe('call_002');
      expect(audioQueue[2].id).toBe('call_003');
    });

    it('should add audio with all metadata', () => {
      const { addToQueue } = useAudioStore.getState();

      const audio: QueuedAudio = {
        id: 'call_001',
        talkgroupId: 927,
        alphaTag: 'Control A2',
        audioUrl: '/api/audio/call_001',
        duration: 15,
      };

      addToQueue(audio);

      const queued = useAudioStore.getState().audioQueue[0];
      expect(queued.alphaTag).toBe('Control A2');
      expect(queued.duration).toBe(15);
    });
  });

  describe('playNext', () => {
    it('should play next item from queue', () => {
      const { addToQueue, playNext } = useAudioStore.getState();

      addToQueue({ id: 'call_001', talkgroupId: 927, audioUrl: '/api/audio/call_001' });
      addToQueue({ id: 'call_002', talkgroupId: 928, audioUrl: '/api/audio/call_002' });

      const next = playNext();

      expect(next?.id).toBe('call_001');
      expect(useAudioStore.getState().currentAudio?.id).toBe('call_001');
      expect(useAudioStore.getState().audioQueue).toHaveLength(1);
      expect(useAudioStore.getState().isPlaying).toBe(true);
    });

    it('should return null when queue is empty', () => {
      const { playNext } = useAudioStore.getState();

      const next = playNext();

      expect(next).toBeNull();
      expect(useAudioStore.getState().currentAudio).toBeNull();
    });

    it('should set currentAudio to null when queue becomes empty', () => {
      const { addToQueue, playNext } = useAudioStore.getState();

      addToQueue({ id: 'call_001', talkgroupId: 927, audioUrl: '/api/audio/call_001' });

      playNext(); // plays call_001
      const next = playNext(); // queue now empty

      expect(next).toBeNull();
      expect(useAudioStore.getState().currentAudio).toBeNull();
    });

    it('should play through entire queue', () => {
      const { addToQueue, playNext } = useAudioStore.getState();

      addToQueue({ id: 'call_001', talkgroupId: 927, audioUrl: '/api/audio/call_001' });
      addToQueue({ id: 'call_002', talkgroupId: 928, audioUrl: '/api/audio/call_002' });
      addToQueue({ id: 'call_003', talkgroupId: 929, audioUrl: '/api/audio/call_003' });

      expect(playNext()?.id).toBe('call_001');
      expect(playNext()?.id).toBe('call_002');
      expect(playNext()?.id).toBe('call_003');
      expect(playNext()).toBeNull();
    });
  });

  describe('clearQueue', () => {
    it('should clear queue and currentAudio', () => {
      const { addToQueue, playNext, clearQueue } = useAudioStore.getState();

      addToQueue({ id: 'call_001', talkgroupId: 927, audioUrl: '/api/audio/call_001' });
      addToQueue({ id: 'call_002', talkgroupId: 928, audioUrl: '/api/audio/call_002' });
      playNext();

      clearQueue();

      expect(useAudioStore.getState().audioQueue).toHaveLength(0);
      expect(useAudioStore.getState().currentAudio).toBeNull();
    });

    it('should clear already empty queue without error', () => {
      const { clearQueue } = useAudioStore.getState();

      clearQueue();

      expect(useAudioStore.getState().audioQueue).toHaveLength(0);
    });
  });

  describe('setCurrentAudio', () => {
    it('should set current audio directly', () => {
      const { setCurrentAudio } = useAudioStore.getState();

      const audio: QueuedAudio = {
        id: 'call_001',
        talkgroupId: 927,
        audioUrl: '/api/audio/call_001',
      };

      setCurrentAudio(audio);

      expect(useAudioStore.getState().currentAudio).toEqual(audio);
    });

    it('should clear current audio', () => {
      const { setCurrentAudio } = useAudioStore.getState();

      setCurrentAudio({
        id: 'call_001',
        talkgroupId: 927,
        audioUrl: '/api/audio/call_001',
      });

      setCurrentAudio(null);

      expect(useAudioStore.getState().currentAudio).toBeNull();
    });
  });
});

describe('useAudioStore - SDR Configuration', () => {
  beforeEach(() => {
    useAudioStore.setState({
      isLiveEnabled: true,
      isPlaying: false,
      currentTalkgroup: null,
      volume: 0.8,
      streamingTalkgroups: new Set(),
      audioQueue: [],
      currentAudio: null,
      sdrConfig: null,
      liveStream: null,
    });
  });

  describe('isInBand', () => {
    it('should return true when no SDR config (assume all in band)', () => {
      const { isInBand } = useAudioStore.getState();

      expect(isInBand(851000000)).toBe(true);
      expect(isInBand(0)).toBe(true);
    });

    it('should correctly check frequency in band', () => {
      useAudioStore.setState({
        sdrConfig: {
          centerFrequency: 770500000,
          sampleRate: 2400000,
          minFrequency: 769300000,
          maxFrequency: 771700000,
        },
      });

      const { isInBand } = useAudioStore.getState();

      // In band
      expect(isInBand(770500000)).toBe(true); // Center
      expect(isInBand(769300000)).toBe(true); // Min edge
      expect(isInBand(771700000)).toBe(true); // Max edge
      expect(isInBand(770000000)).toBe(true); // Middle

      // Out of band
      expect(isInBand(769299999)).toBe(false); // Just below min
      expect(isInBand(771700001)).toBe(false); // Just above max
      expect(isInBand(768000000)).toBe(false); // Well below
      expect(isInBand(773000000)).toBe(false); // Well above
    });

    it('should handle edge cases at boundary', () => {
      useAudioStore.setState({
        sdrConfig: {
          centerFrequency: 851000000,
          sampleRate: 3000000,
          minFrequency: 849500000,
          maxFrequency: 852500000,
        },
      });

      const { isInBand } = useAudioStore.getState();

      expect(isInBand(849500000)).toBe(true); // Exact min
      expect(isInBand(852500000)).toBe(true); // Exact max
    });
  });
});

describe('useAudioStore - Live Stream Info', () => {
  beforeEach(() => {
    useAudioStore.setState({
      isLiveEnabled: true,
      isPlaying: false,
      currentTalkgroup: null,
      volume: 0.8,
      streamingTalkgroups: new Set(),
      audioQueue: [],
      currentAudio: null,
      sdrConfig: null,
      liveStream: null,
    });
  });

  it('should set live stream info', () => {
    const { setLiveStream } = useAudioStore.getState();

    setLiveStream({
      talkgroupId: 927,
      alphaTag: 'Control A2',
      frequency: 852387500,
      lastUpdate: Date.now(),
    });

    const { liveStream } = useAudioStore.getState();
    expect(liveStream?.talkgroupId).toBe(927);
    expect(liveStream?.alphaTag).toBe('Control A2');
    expect(liveStream?.frequency).toBe(852387500);
  });

  it('should clear live stream info', () => {
    const { setLiveStream } = useAudioStore.getState();

    setLiveStream({
      talkgroupId: 927,
      lastUpdate: Date.now(),
    });

    setLiveStream(null);

    expect(useAudioStore.getState().liveStream).toBeNull();
  });

  it('should update live stream info', () => {
    const { setLiveStream } = useAudioStore.getState();

    setLiveStream({
      talkgroupId: 927,
      lastUpdate: 1000,
    });

    setLiveStream({
      talkgroupId: 928,
      lastUpdate: 2000,
    });

    const { liveStream } = useAudioStore.getState();
    expect(liveStream?.talkgroupId).toBe(928);
    expect(liveStream?.lastUpdate).toBe(2000);
  });
});

describe('Audio Streaming Integration Scenarios', () => {
  beforeEach(() => {
    useAudioStore.setState({
      isLiveEnabled: true,
      isPlaying: false,
      currentTalkgroup: null,
      volume: 0.8,
      streamingTalkgroups: new Set(),
      audioQueue: [],
      currentAudio: null,
      sdrConfig: {
        centerFrequency: 851000000,
        sampleRate: 3000000,
        minFrequency: 849500000,
        maxFrequency: 852500000,
      },
      liveStream: null,
    });
  });

  it('should handle typical live streaming session', () => {
    const {
      setLiveEnabled,
      setPlaying,
      setCurrentTalkgroup,
      setLiveStream,
    } = useAudioStore.getState();

    // User enables live streaming
    setLiveEnabled(true);
    expect(useAudioStore.getState().isLiveEnabled).toBe(true);

    // Call starts
    setPlaying(true);
    setCurrentTalkgroup(927);
    setLiveStream({
      talkgroupId: 927,
      alphaTag: 'Control A2',
      frequency: 851250000,
      lastUpdate: Date.now(),
    });

    expect(useAudioStore.getState().isPlaying).toBe(true);
    expect(useAudioStore.getState().currentTalkgroup).toBe(927);
    expect(useAudioStore.getState().liveStream?.talkgroupId).toBe(927);

    // Call ends
    setPlaying(false);
    setCurrentTalkgroup(null);
    setLiveStream(null);

    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().liveStream).toBeNull();
  });

  it('should handle recording queue during live streaming', () => {
    const {
      setLiveEnabled,
      addToQueue,
      playNext,
    } = useAudioStore.getState();

    setLiveEnabled(true);

    // Recordings are queued as they come in
    addToQueue({ id: 'rec_001', talkgroupId: 927, audioUrl: '/api/audio/rec_001' });
    addToQueue({ id: 'rec_002', talkgroupId: 928, audioUrl: '/api/audio/rec_002' });
    addToQueue({ id: 'rec_003', talkgroupId: 927, audioUrl: '/api/audio/rec_003' });

    expect(useAudioStore.getState().audioQueue).toHaveLength(3);

    // User plays recordings
    const first = playNext();
    expect(first?.id).toBe('rec_001');
    expect(useAudioStore.getState().isPlaying).toBe(true);

    const second = playNext();
    expect(second?.id).toBe('rec_002');

    const third = playNext();
    expect(third?.id).toBe('rec_003');

    const empty = playNext();
    expect(empty).toBeNull();
  });

  it('should filter recordings by subscribed talkgroups', () => {
    const {
      toggleStreamingTalkgroup,
    } = useAudioStore.getState();

    // User subscribes to specific talkgroups
    toggleStreamingTalkgroup(927);
    toggleStreamingTalkgroup(929);

    const { streamingTalkgroups } = useAudioStore.getState();

    // Simulate checking if a recording should be queued
    const shouldQueue = (tgId: number) =>
      streamingTalkgroups.size === 0 || streamingTalkgroups.has(tgId);

    expect(shouldQueue(927)).toBe(true);  // Subscribed
    expect(shouldQueue(928)).toBe(false); // Not subscribed
    expect(shouldQueue(929)).toBe(true);  // Subscribed
  });

  it('should check frequency in band before queueing', () => {
    const { isInBand } = useAudioStore.getState();

    // Frequencies within SDR range (849.5 - 852.5 MHz)
    expect(isInBand(851000000)).toBe(true);
    expect(isInBand(850000000)).toBe(true);
    expect(isInBand(852000000)).toBe(true);

    // Frequencies outside SDR range
    expect(isInBand(848000000)).toBe(false);
    expect(isInBand(854000000)).toBe(false);
  });
});
