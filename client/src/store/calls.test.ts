import { describe, it, expect, beforeEach } from 'vitest';
import { useCallsStore } from './calls';

/**
 * Calls Store Tests
 *
 * These tests verify:
 * - Call addition and updates
 * - Active call tracking
 * - selectedCall synchronization (critical for UI updates)
 * - Audio file linking behavior
 */

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

  describe('addCall', () => {
    it('should add a call with isActive true by default', () => {
      const { addCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
      });

      const { calls, activeCalls } = useCallsStore.getState();
      expect(calls).toHaveLength(1);
      expect(calls[0].id).toBe('927-1704825600');
      expect(calls[0].isActive).toBe(true);
      expect(activeCalls).toHaveLength(1);
    });

    it('should add a call with isActive false when specified', () => {
      const { addCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
        isActive: false,
      });

      const { calls, activeCalls } = useCallsStore.getState();
      expect(calls).toHaveLength(1);
      expect(calls[0].isActive).toBe(false);
      expect(activeCalls).toHaveLength(0);
    });

    it('should add call with audio_file when provided', () => {
      const { addCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
        audio_file: '/var/lib/trunk-recorder/audio/927-1704825600.wav',
        isActive: false,
      });

      const { calls } = useCallsStore.getState();
      expect(calls[0].audio_file).toBe('/var/lib/trunk-recorder/audio/927-1704825600.wav');
    });

    it('should add calls in newest-first order', () => {
      const { addCall } = useCallsStore.getState();

      addCall({ id: 'call_1', talkgroup_id: 927, start_time: 1000 });
      addCall({ id: 'call_2', talkgroup_id: 928, start_time: 2000 });
      addCall({ id: 'call_3', talkgroup_id: 929, start_time: 3000 });

      const { calls } = useCallsStore.getState();
      expect(calls[0].id).toBe('call_3');
      expect(calls[1].id).toBe('call_2');
      expect(calls[2].id).toBe('call_1');
    });
  });

  describe('updateCall', () => {
    it('should update an existing call', () => {
      const { addCall, updateCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
      });

      updateCall('927-1704825600', {
        stop_time: 1704825610,
        duration: 10,
      });

      const { calls } = useCallsStore.getState();
      expect(calls[0].stop_time).toBe(1704825610);
      expect(calls[0].duration).toBe(10);
      expect(calls[0].isActive).toBe(false);
    });

    it('should add audio_file to existing call', () => {
      const { addCall, updateCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
      });

      expect(useCallsStore.getState().calls[0].audio_file).toBeNull();

      updateCall('927-1704825600', {
        audio_file: '/audio/927-1704825600.wav',
        stop_time: 1704825610,
        duration: 10,
      });

      expect(useCallsStore.getState().calls[0].audio_file).toBe('/audio/927-1704825600.wav');
    });

    it('should remove call from activeCalls when updated', () => {
      const { addCall, updateCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
      });

      expect(useCallsStore.getState().activeCalls).toHaveLength(1);

      updateCall('927-1704825600', {
        stop_time: 1704825610,
      });

      expect(useCallsStore.getState().activeCalls).toHaveLength(0);
    });

    it('should not update non-existent call', () => {
      const { addCall, updateCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        start_time: 1704825600,
      });

      updateCall('non-existent-id', {
        stop_time: 1704825610,
      });

      const { calls } = useCallsStore.getState();
      expect(calls[0].stop_time).toBeNull();
    });
  });

  describe('selectedCall synchronization', () => {
    it('should update selectedCall when the selected call is updated', () => {
      const { addCall, selectCall, updateCall } = useCallsStore.getState();

      // Add a call
      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
      });

      // Select it
      const call = useCallsStore.getState().calls[0];
      selectCall(call);

      expect(useCallsStore.getState().selectedCall?.audio_file).toBeNull();

      // Update the call with audio_file
      updateCall('927-1704825600', {
        audio_file: '/audio/927-1704825600.wav',
        stop_time: 1704825610,
        duration: 10,
      });

      // selectedCall should be updated automatically
      const { selectedCall } = useCallsStore.getState();
      expect(selectedCall?.audio_file).toBe('/audio/927-1704825600.wav');
      expect(selectedCall?.stop_time).toBe(1704825610);
      expect(selectedCall?.duration).toBe(10);
      expect(selectedCall?.isActive).toBe(false);
    });

    it('should not update selectedCall when a different call is updated', () => {
      const { addCall, selectCall, updateCall } = useCallsStore.getState();

      addCall({ id: 'call_1', talkgroup_id: 927, start_time: 1000 });
      addCall({ id: 'call_2', talkgroup_id: 928, start_time: 2000 });

      // Select call_1
      const call1 = useCallsStore.getState().calls.find(c => c.id === 'call_1')!;
      selectCall(call1);

      // Update call_2
      updateCall('call_2', {
        audio_file: '/audio/call_2.wav',
      });

      // selectedCall should still be call_1, unchanged
      const { selectedCall } = useCallsStore.getState();
      expect(selectedCall?.id).toBe('call_1');
      expect(selectedCall?.audio_file).toBeNull();
    });

    it('should keep selectedCall null when no call is selected', () => {
      const { addCall, updateCall } = useCallsStore.getState();

      addCall({
        id: '927-1704825600',
        talkgroup_id: 927,
        start_time: 1704825600,
      });

      updateCall('927-1704825600', {
        audio_file: '/audio/927-1704825600.wav',
      });

      expect(useCallsStore.getState().selectedCall).toBeNull();
    });
  });

  describe('setActiveCalls', () => {
    it('should set active calls', () => {
      const { setActiveCalls } = useCallsStore.getState();

      setActiveCalls([
        { id: 'call_1', talkgroup_id: 927, frequency: 852387500 },
        { id: 'call_2', talkgroup_id: 928, frequency: 851250000 },
      ]);

      const { activeCalls } = useCallsStore.getState();
      expect(activeCalls).toHaveLength(2);
      expect(activeCalls[0].isActive).toBe(true);
      expect(activeCalls[1].isActive).toBe(true);
    });

    it('should replace existing active calls', () => {
      const { setActiveCalls } = useCallsStore.getState();

      setActiveCalls([
        { id: 'call_1', talkgroup_id: 927 },
      ]);

      setActiveCalls([
        { id: 'call_2', talkgroup_id: 928 },
        { id: 'call_3', talkgroup_id: 929 },
      ]);

      const { activeCalls } = useCallsStore.getState();
      expect(activeCalls).toHaveLength(2);
      expect(activeCalls.find(c => c.id === 'call_1')).toBeUndefined();
    });
  });

  describe('clearCalls', () => {
    it('should clear all calls and selectedCall', () => {
      const { addCall, selectCall, clearCalls } = useCallsStore.getState();

      addCall({ id: 'call_1', talkgroup_id: 927, start_time: 1000 });
      addCall({ id: 'call_2', talkgroup_id: 928, start_time: 2000 });

      const call = useCallsStore.getState().calls[0];
      selectCall(call);

      clearCalls();

      const state = useCallsStore.getState();
      expect(state.calls).toHaveLength(0);
      expect(state.activeCalls).toHaveLength(0);
      expect(state.selectedCall).toBeNull();
    });
  });
});

describe('Audio File Linking Flow', () => {
  beforeEach(() => {
    useCallsStore.setState({
      calls: [],
      activeCalls: [],
      selectedCall: null,
      isLoading: false,
      error: null,
    });
  });

  it('should link audio file through callStart → callEnd flow', () => {
    const { addCall, updateCall, selectCall } = useCallsStore.getState();

    // Step 1: callStart - call begins, no audio yet
    addCall({
      id: '927-1704825600',
      talkgroup_id: 927,
      frequency: 852387500,
      start_time: 1704825600,
      isActive: true,
    });

    let state = useCallsStore.getState();
    expect(state.calls).toHaveLength(1);
    expect(state.activeCalls).toHaveLength(1);
    expect(state.calls[0].audio_file).toBeNull();
    expect(state.calls[0].isActive).toBe(true);

    // User selects the active call to view details
    selectCall(state.calls[0]);
    expect(useCallsStore.getState().selectedCall?.isActive).toBe(true);

    // Step 2: callEnd - call ends, audio file is linked
    updateCall('927-1704825600', {
      stop_time: 1704825610,
      duration: 10,
      audio_file: '/var/lib/trunk-recorder/audio/927-1704825600.wav',
    });

    state = useCallsStore.getState();

    // Call should be updated
    expect(state.calls[0].audio_file).toBe('/var/lib/trunk-recorder/audio/927-1704825600.wav');
    expect(state.calls[0].isActive).toBe(false);
    expect(state.calls[0].duration).toBe(10);

    // Active calls should be empty
    expect(state.activeCalls).toHaveLength(0);

    // selectedCall should also be updated (this is critical!)
    expect(state.selectedCall?.audio_file).toBe('/var/lib/trunk-recorder/audio/927-1704825600.wav');
    expect(state.selectedCall?.isActive).toBe(false);
  });

  it('should handle call added directly with audio file (newRecording)', () => {
    const { addCall } = useCallsStore.getState();

    // Sometimes calls are added already complete (from newRecording)
    addCall({
      id: '927-1704825600',
      talkgroup_id: 927,
      frequency: 852387500,
      start_time: 1704825600,
      stop_time: 1704825610,
      duration: 10,
      audio_file: '/audio/927-1704825600.wav',
      isActive: false,
    });

    const { calls, activeCalls } = useCallsStore.getState();
    expect(calls).toHaveLength(1);
    expect(calls[0].audio_file).toBe('/audio/927-1704825600.wav');
    expect(calls[0].isActive).toBe(false);
    expect(activeCalls).toHaveLength(0);
  });

  it('should handle multiple calls with proper audio linking', () => {
    const { addCall, updateCall } = useCallsStore.getState();

    // Start multiple calls
    addCall({ id: '927-1000', talkgroup_id: 927, start_time: 1000, isActive: true });
    addCall({ id: '928-1001', talkgroup_id: 928, start_time: 1001, isActive: true });
    addCall({ id: '929-1002', talkgroup_id: 929, start_time: 1002, isActive: true });

    expect(useCallsStore.getState().activeCalls).toHaveLength(3);

    // End calls with audio files
    updateCall('927-1000', { audio_file: '/audio/927-1000.wav', stop_time: 1010 });
    updateCall('928-1001', { audio_file: '/audio/928-1001.wav', stop_time: 1015 });
    updateCall('929-1002', { audio_file: '/audio/929-1002.wav', stop_time: 1012 });

    const { calls, activeCalls } = useCallsStore.getState();

    expect(activeCalls).toHaveLength(0);
    expect(calls.find(c => c.id === '927-1000')?.audio_file).toBe('/audio/927-1000.wav');
    expect(calls.find(c => c.id === '928-1001')?.audio_file).toBe('/audio/928-1001.wav');
    expect(calls.find(c => c.id === '929-1002')?.audio_file).toBe('/audio/929-1002.wav');
  });

  it('should handle encrypted calls (no audio file)', () => {
    const { addCall, updateCall, selectCall } = useCallsStore.getState();

    addCall({
      id: '927-1704825600',
      talkgroup_id: 927,
      frequency: 852387500,
      start_time: 1704825600,
      encrypted: true,
      isActive: true,
    });

    const call = useCallsStore.getState().calls[0];
    selectCall(call);

    // Call ends but no audio file (encrypted)
    updateCall('927-1704825600', {
      stop_time: 1704825610,
      duration: 10,
      // No audio_file - encrypted calls don't have recordings
    });

    const { selectedCall } = useCallsStore.getState();
    expect(selectedCall?.audio_file).toBeNull();
    expect(selectedCall?.encrypted).toBe(true);
    expect(selectedCall?.isActive).toBe(false);
  });
});

describe('Call ID Consistency', () => {
  beforeEach(() => {
    useCallsStore.setState({
      calls: [],
      activeCalls: [],
      selectedCall: null,
      isLoading: false,
      error: null,
    });
  });

  it('should use consistent call ID format (talkgroup-startTime)', () => {
    const { addCall, updateCall } = useCallsStore.getState();

    const talkgroup = 927;
    const startTime = 1704825600;
    const callId = `${talkgroup}-${startTime}`;

    addCall({
      id: callId,
      talkgroup_id: talkgroup,
      start_time: startTime,
    });

    updateCall(callId, {
      audio_file: `/audio/${callId}.wav`,
    });

    const { calls } = useCallsStore.getState();
    expect(calls[0].id).toBe('927-1704825600');
    expect(calls[0].audio_file).toBe('/audio/927-1704825600.wav');
  });

  it('should match call by ID for updates', () => {
    const { addCall, updateCall } = useCallsStore.getState();

    // Add calls with different IDs
    addCall({ id: '927-1000', talkgroup_id: 927, start_time: 1000 });
    addCall({ id: '927-2000', talkgroup_id: 927, start_time: 2000 });

    // Update only one of them
    updateCall('927-1000', { audio_file: '/audio/927-1000.wav' });

    const { calls } = useCallsStore.getState();
    expect(calls.find(c => c.id === '927-1000')?.audio_file).toBe('/audio/927-1000.wav');
    expect(calls.find(c => c.id === '927-2000')?.audio_file).toBeNull();
  });
});
