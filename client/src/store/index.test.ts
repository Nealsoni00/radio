import { describe, it, expect, beforeEach } from 'vitest';
import { useCallsStore, useTalkgroupsStore, useAudioStore, useConnectionStore, useControlChannelStore } from './index';
import type { Call, Talkgroup, ControlChannelEvent } from '../types';

describe('useCallsStore', () => {
  beforeEach(() => {
    useCallsStore.setState({
      calls: [],
      activeCalls: [],
      selectedCall: null,
      isLoading: false,
      error: null,
    });
  });

  it('should add a call', () => {
    const { addCall } = useCallsStore.getState();

    addCall({
      id: 'call_001',
      talkgroup_id: 3219,
      frequency: 771356250,
      start_time: 1704825600,
    });

    const { calls, activeCalls } = useCallsStore.getState();
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('call_001');
    expect(calls[0].talkgroup_id).toBe(3219);
    expect(calls[0].isActive).toBe(true);
    expect(activeCalls).toHaveLength(1);
  });

  it('should update a call and mark it inactive', () => {
    const { addCall, updateCall } = useCallsStore.getState();

    addCall({
      id: 'call_001',
      talkgroup_id: 3219,
      frequency: 771356250,
      start_time: 1704825600,
    });

    updateCall('call_001', {
      stop_time: 1704825610,
      duration: 10,
    });

    const { calls, activeCalls } = useCallsStore.getState();
    expect(calls[0].stop_time).toBe(1704825610);
    expect(calls[0].duration).toBe(10);
    expect(calls[0].isActive).toBe(false);
    expect(activeCalls).toHaveLength(0);
  });

  it('should set active calls', () => {
    const { setActiveCalls } = useCallsStore.getState();

    setActiveCalls([
      { id: 'call_001', talkgroup_id: 3219, frequency: 771356250 },
      { id: 'call_002', talkgroup_id: 4567, frequency: 770106250 },
    ]);

    const { activeCalls } = useCallsStore.getState();
    expect(activeCalls).toHaveLength(2);
    expect(activeCalls[0].isActive).toBe(true);
  });

  it('should select a call', () => {
    const { addCall, selectCall } = useCallsStore.getState();

    addCall({
      id: 'call_001',
      talkgroup_id: 3219,
      frequency: 771356250,
      start_time: 1704825600,
    });

    const { calls } = useCallsStore.getState();
    selectCall(calls[0]);

    const { selectedCall } = useCallsStore.getState();
    expect(selectedCall?.id).toBe('call_001');
  });

  it('should limit calls to 500', () => {
    const { addCall } = useCallsStore.getState();

    for (let i = 0; i < 510; i++) {
      addCall({
        id: `call_${i}`,
        talkgroup_id: 3219,
        frequency: 771356250,
        start_time: 1704825600 + i,
      });
    }

    const { calls } = useCallsStore.getState();
    expect(calls.length).toBeLessThanOrEqual(500);
  });
});

describe('useTalkgroupsStore', () => {
  beforeEach(() => {
    useTalkgroupsStore.setState({
      talkgroups: [],
      selectedTalkgroups: new Set(),
      groupFilter: null,
      searchQuery: '',
      isLoading: false,
    });
  });

  it('should toggle talkgroup selection', () => {
    const { toggleTalkgroup } = useTalkgroupsStore.getState();

    toggleTalkgroup(3219);
    expect(useTalkgroupsStore.getState().selectedTalkgroups.has(3219)).toBe(true);

    toggleTalkgroup(3219);
    expect(useTalkgroupsStore.getState().selectedTalkgroups.has(3219)).toBe(false);
  });

  it('should select all (empty set means all)', () => {
    const { toggleTalkgroup, selectAll } = useTalkgroupsStore.getState();

    toggleTalkgroup(3219);
    toggleTalkgroup(4567);

    selectAll();
    expect(useTalkgroupsStore.getState().selectedTalkgroups.size).toBe(0);
  });

  it('should set group filter', () => {
    const { setGroupFilter } = useTalkgroupsStore.getState();

    setGroupFilter('Phoenix PD');
    expect(useTalkgroupsStore.getState().groupFilter).toBe('Phoenix PD');

    setGroupFilter(null);
    expect(useTalkgroupsStore.getState().groupFilter).toBeNull();
  });

  it('should set search query', () => {
    const { setSearchQuery } = useTalkgroupsStore.getState();

    setSearchQuery('dispatch');
    expect(useTalkgroupsStore.getState().searchQuery).toBe('dispatch');
  });
});

describe('useAudioStore', () => {
  beforeEach(() => {
    useAudioStore.setState({
      isLiveEnabled: false,
      isPlaying: false,
      currentTalkgroup: null,
      volume: 0.8,
      streamingTalkgroups: new Set(),
      audioQueue: [],
      currentAudio: null,
      sdrConfig: null,
    });
  });

  it('should toggle live audio', () => {
    const { setLiveEnabled } = useAudioStore.getState();

    setLiveEnabled(true);
    expect(useAudioStore.getState().isLiveEnabled).toBe(true);

    setLiveEnabled(false);
    expect(useAudioStore.getState().isLiveEnabled).toBe(false);
  });

  it('should set volume', () => {
    const { setVolume } = useAudioStore.getState();

    setVolume(0.5);
    expect(useAudioStore.getState().volume).toBe(0.5);
  });

  it('should toggle streaming talkgroups', () => {
    const { toggleStreamingTalkgroup } = useAudioStore.getState();

    toggleStreamingTalkgroup(3219);
    expect(useAudioStore.getState().streamingTalkgroups.has(3219)).toBe(true);

    toggleStreamingTalkgroup(3219);
    expect(useAudioStore.getState().streamingTalkgroups.has(3219)).toBe(false);
  });

  it('should add to audio queue', () => {
    const { addToQueue } = useAudioStore.getState();

    addToQueue({
      id: 'call_001',
      talkgroupId: 3219,
      audioUrl: '/api/audio/call_001',
    });

    expect(useAudioStore.getState().audioQueue).toHaveLength(1);
  });

  it('should play next from queue', () => {
    const { addToQueue, playNext } = useAudioStore.getState();

    addToQueue({ id: 'call_001', talkgroupId: 3219, audioUrl: '/api/audio/call_001' });
    addToQueue({ id: 'call_002', talkgroupId: 4567, audioUrl: '/api/audio/call_002' });

    const next = playNext();
    expect(next?.id).toBe('call_001');
    expect(useAudioStore.getState().audioQueue).toHaveLength(1);
    expect(useAudioStore.getState().currentAudio?.id).toBe('call_001');
    expect(useAudioStore.getState().isPlaying).toBe(true);
  });

  it('should clear queue', () => {
    const { addToQueue, clearQueue } = useAudioStore.getState();

    addToQueue({ id: 'call_001', talkgroupId: 3219, audioUrl: '/api/audio/call_001' });
    addToQueue({ id: 'call_002', talkgroupId: 4567, audioUrl: '/api/audio/call_002' });

    clearQueue();
    expect(useAudioStore.getState().audioQueue).toHaveLength(0);
    expect(useAudioStore.getState().currentAudio).toBeNull();
  });

  it('should calculate in-band frequency', () => {
    useAudioStore.setState({
      sdrConfig: {
        centerFrequency: 770500000,
        sampleRate: 2400000,
        minFrequency: 769300000,
        maxFrequency: 771700000,
      },
    });

    const { isInBand } = useAudioStore.getState();

    expect(isInBand(770500000)).toBe(true);  // Center
    expect(isInBand(769300000)).toBe(true);  // Min edge
    expect(isInBand(771700000)).toBe(true);  // Max edge
    expect(isInBand(768000000)).toBe(false); // Below range
    expect(isInBand(773000000)).toBe(false); // Above range
  });
});

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      isConnected: false,
      trunkRecorderConnected: false,
      decodeRate: 0,
    });
  });

  it('should set connected status', () => {
    const { setConnected } = useConnectionStore.getState();

    setConnected(true);
    expect(useConnectionStore.getState().isConnected).toBe(true);
  });

  it('should set trunk recorder connected status', () => {
    const { setTrunkRecorderConnected } = useConnectionStore.getState();

    setTrunkRecorderConnected(true);
    expect(useConnectionStore.getState().trunkRecorderConnected).toBe(true);
  });

  it('should set decode rate', () => {
    const { setDecodeRate } = useConnectionStore.getState();

    setDecodeRate(25);
    expect(useConnectionStore.getState().decodeRate).toBe(25);
  });
});

describe('useControlChannelStore', () => {
  beforeEach(() => {
    useControlChannelStore.setState({
      events: [],
      isLoading: false,
      maxEvents: 200,
    });
  });

  it('should add control channel event', () => {
    const { addEvent } = useControlChannelStore.getState();

    const event: ControlChannelEvent = {
      timestamp: '2026-01-09T12:00:00.000Z',
      type: 'grant',
      talkgroup: 3219,
      frequency: 771356250,
      message: 'TG 3219 granted',
    };

    addEvent(event);
    expect(useControlChannelStore.getState().events).toHaveLength(1);
    expect(useControlChannelStore.getState().events[0].type).toBe('grant');
  });

  it('should prepend new events (newest first)', () => {
    const { addEvent } = useControlChannelStore.getState();

    addEvent({
      timestamp: '2026-01-09T12:00:00.000Z',
      type: 'grant',
      talkgroup: 3219,
      message: 'First event',
    });

    addEvent({
      timestamp: '2026-01-09T12:00:01.000Z',
      type: 'end',
      talkgroup: 3219,
      message: 'Second event',
    });

    const { events } = useControlChannelStore.getState();
    expect(events[0].message).toBe('Second event');
    expect(events[1].message).toBe('First event');
  });

  it('should limit events to maxEvents', () => {
    const { addEvent } = useControlChannelStore.getState();

    for (let i = 0; i < 250; i++) {
      addEvent({
        timestamp: `2026-01-09T12:00:${i.toString().padStart(2, '0')}.000Z`,
        type: 'grant',
        talkgroup: 3219,
        message: `Event ${i}`,
      });
    }

    expect(useControlChannelStore.getState().events.length).toBeLessThanOrEqual(200);
  });

  it('should set events', () => {
    const { setEvents } = useControlChannelStore.getState();

    setEvents([
      { timestamp: '2026-01-09T12:00:00.000Z', type: 'grant', message: 'Event 1' },
      { timestamp: '2026-01-09T12:00:01.000Z', type: 'end', message: 'Event 2' },
    ]);

    expect(useControlChannelStore.getState().events).toHaveLength(2);
  });

  it('should clear events', () => {
    const { addEvent, clearEvents } = useControlChannelStore.getState();

    addEvent({
      timestamp: '2026-01-09T12:00:00.000Z',
      type: 'grant',
      talkgroup: 3219,
      message: 'Test event',
    });

    clearEvents();
    expect(useControlChannelStore.getState().events).toHaveLength(0);
  });
});
