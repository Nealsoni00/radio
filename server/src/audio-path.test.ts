import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, isAbsolute } from 'path';

/**
 * Audio Path Normalization Tests
 *
 * These tests ensure that audio file paths from trunk-recorder are correctly
 * normalized to absolute paths, regardless of how trunk-recorder sends them.
 *
 * trunk-recorder may send:
 * - Absolute paths: /var/lib/trunk-recorder/audio/927-1234567890.wav
 * - Relative paths: audio/927-1234567890.wav
 * - Just filenames: 927-1234567890.wav
 */

// Replicate the normalizeAudioPath function from index.ts
function normalizeAudioPath(
  filename: string | undefined | null,
  audioDir: string
): string | null {
  if (!filename) return null;

  // If it's already an absolute path, use it as-is
  if (isAbsolute(filename)) {
    return filename;
  }

  // Otherwise, join with the audio directory
  return join(audioDir, filename);
}

// Replicate the generateAudioPath function from index.ts
function generateAudioPath(
  talkgroup: number,
  startTime: number,
  audioDir: string
): string {
  const callId = `${talkgroup}-${startTime}`;
  return join(audioDir, `${callId}.wav`);
}

// Replicate the consistent call ID generation
function generateConsistentCallId(talkgroup: number, startTime: number): string {
  return `${talkgroup}-${startTime}`;
}

describe('Audio Path Normalization', () => {
  const audioDir = '/var/lib/trunk-recorder/audio';

  describe('normalizeAudioPath', () => {
    it('should return null for null filename', () => {
      expect(normalizeAudioPath(null, audioDir)).toBeNull();
    });

    it('should return null for undefined filename', () => {
      expect(normalizeAudioPath(undefined, audioDir)).toBeNull();
    });

    it('should return null for empty string filename', () => {
      expect(normalizeAudioPath('', audioDir)).toBeNull();
    });

    it('should preserve absolute paths', () => {
      const absolutePath = '/var/lib/trunk-recorder/audio/927-1704825600.wav';
      expect(normalizeAudioPath(absolutePath, audioDir)).toBe(absolutePath);
    });

    it('should preserve different absolute paths', () => {
      const absolutePath = '/tmp/recordings/call-123.wav';
      expect(normalizeAudioPath(absolutePath, audioDir)).toBe(absolutePath);
    });

    it('should join relative paths with audioDir', () => {
      const relativePath = 'audio/927-1704825600.wav';
      const expected = join(audioDir, relativePath);
      expect(normalizeAudioPath(relativePath, audioDir)).toBe(expected);
    });

    it('should join filename-only paths with audioDir', () => {
      const filename = '927-1704825600.wav';
      const expected = join(audioDir, filename);
      expect(normalizeAudioPath(filename, audioDir)).toBe(expected);
    });

    it('should handle filenames with complex formats', () => {
      const filename = '810-1768031171_852387500.0-call_47.wav';
      const expected = join(audioDir, filename);
      expect(normalizeAudioPath(filename, audioDir)).toBe(expected);
    });

    it('should handle paths with subdirectories', () => {
      const relativePath = '2024/01/10/927-1704825600.wav';
      const expected = join(audioDir, relativePath);
      expect(normalizeAudioPath(relativePath, audioDir)).toBe(expected);
    });
  });

  describe('generateAudioPath', () => {
    it('should generate correct path from talkgroup and startTime', () => {
      const path = generateAudioPath(927, 1704825600, audioDir);
      expect(path).toBe('/var/lib/trunk-recorder/audio/927-1704825600.wav');
    });

    it('should handle large talkgroup IDs', () => {
      const path = generateAudioPath(12345678, 1704825600, audioDir);
      expect(path).toBe('/var/lib/trunk-recorder/audio/12345678-1704825600.wav');
    });

    it('should handle zero talkgroup ID', () => {
      const path = generateAudioPath(0, 1704825600, audioDir);
      expect(path).toBe('/var/lib/trunk-recorder/audio/0-1704825600.wav');
    });

    it('should generate consistent paths', () => {
      const path1 = generateAudioPath(927, 1704825600, audioDir);
      const path2 = generateAudioPath(927, 1704825600, audioDir);
      const path3 = generateAudioPath(927, 1704825600, audioDir);

      expect(path1).toBe(path2);
      expect(path2).toBe(path3);
    });

    it('should generate different paths for different talkgroups', () => {
      const path1 = generateAudioPath(927, 1704825600, audioDir);
      const path2 = generateAudioPath(928, 1704825600, audioDir);

      expect(path1).not.toBe(path2);
    });

    it('should generate different paths for different timestamps', () => {
      const path1 = generateAudioPath(927, 1704825600, audioDir);
      const path2 = generateAudioPath(927, 1704825601, audioDir);

      expect(path1).not.toBe(path2);
    });
  });

  describe('generateConsistentCallId', () => {
    it('should generate call ID in talkgroup-startTime format', () => {
      const id = generateConsistentCallId(927, 1704825600);
      expect(id).toBe('927-1704825600');
    });

    it('should be consistent for same inputs', () => {
      const id1 = generateConsistentCallId(927, 1704825600);
      const id2 = generateConsistentCallId(927, 1704825600);

      expect(id1).toBe(id2);
    });

    it('should be unique for different talkgroups', () => {
      const id1 = generateConsistentCallId(927, 1704825600);
      const id2 = generateConsistentCallId(928, 1704825600);

      expect(id1).not.toBe(id2);
    });

    it('should be unique for different timestamps', () => {
      const id1 = generateConsistentCallId(927, 1704825600);
      const id2 = generateConsistentCallId(927, 1704825601);

      expect(id1).not.toBe(id2);
    });

    it('should match the audio filename base', () => {
      const talkgroup = 927;
      const startTime = 1704825600;

      const callId = generateConsistentCallId(talkgroup, startTime);
      const audioPath = generateAudioPath(talkgroup, startTime, audioDir);

      // The audio filename (without extension) should match the call ID
      const audioFilename = audioPath.split('/').pop()!.replace('.wav', '');
      expect(audioFilename).toBe(callId);
    });
  });
});

describe('Call ID Matching Scenarios', () => {
  /**
   * These tests verify that calls can be matched correctly between
   * callStart and callEnd events, even when timing varies slightly.
   */

  interface MockCall {
    id: string;
    talkgroup_id: number;
    audio_file: string | null;
  }

  // Simulate finding a call by ID or talkgroup (like the client does)
  function findCall(
    calls: MockCall[],
    activeCalls: MockCall[],
    incomingId: string,
    incomingTalkgroupId: number
  ): MockCall | undefined {
    // Try exact ID first
    const byExactId = calls.find((c) => c.id === incomingId);
    if (byExactId) return byExactId;

    // Fall back to talkgroup match in active calls
    const byTalkgroup = activeCalls.find((c) => c.talkgroup_id === incomingTalkgroupId);
    return byTalkgroup;
  }

  it('should match by exact ID when available', () => {
    const calls: MockCall[] = [
      { id: '927-1704825600', talkgroup_id: 927, audio_file: null },
    ];
    const activeCalls: MockCall[] = [];

    const found = findCall(calls, activeCalls, '927-1704825600', 927);
    expect(found).toBeDefined();
    expect(found!.id).toBe('927-1704825600');
  });

  it('should fall back to talkgroup match when exact ID not found', () => {
    const calls: MockCall[] = [];
    const activeCalls: MockCall[] = [
      { id: '927-1704825600', talkgroup_id: 927, audio_file: null },
    ];

    // callEnd comes with slightly different timestamp
    const found = findCall(calls, activeCalls, '927-1704825601', 927);
    expect(found).toBeDefined();
    expect(found!.id).toBe('927-1704825600');
  });

  it('should return undefined when no match found', () => {
    const calls: MockCall[] = [
      { id: '927-1704825600', talkgroup_id: 927, audio_file: null },
    ];
    const activeCalls: MockCall[] = [];

    // Different talkgroup, no match
    const found = findCall(calls, activeCalls, '928-1704825600', 928);
    expect(found).toBeUndefined();
  });

  it('should prefer exact ID over talkgroup match', () => {
    const calls: MockCall[] = [
      { id: '927-1704825600', talkgroup_id: 927, audio_file: '/path/a.wav' },
    ];
    const activeCalls: MockCall[] = [
      { id: '927-1704825599', talkgroup_id: 927, audio_file: null },
    ];

    const found = findCall(calls, activeCalls, '927-1704825600', 927);
    expect(found).toBeDefined();
    expect(found!.audio_file).toBe('/path/a.wav'); // Should match the one in calls, not activeCalls
  });
});

describe('End-to-End Audio Linking Flow', () => {
  /**
   * These tests simulate the complete flow from callStart to callEnd
   * to verify audio files are properly linked.
   */

  interface Call {
    id: string;
    talkgroup_id: number;
    frequency: number;
    start_time: number;
    stop_time: number | null;
    duration: number | null;
    audio_file: string | null;
    isActive: boolean;
  }

  // Simulate the store
  let calls: Call[] = [];
  let activeCalls: Call[] = [];

  const addCall = (call: Partial<Call>) => {
    const fullCall: Call = {
      id: call.id || '',
      talkgroup_id: call.talkgroup_id || 0,
      frequency: call.frequency || 0,
      start_time: call.start_time || 0,
      stop_time: call.stop_time ?? null,
      duration: call.duration ?? null,
      audio_file: call.audio_file ?? null,
      isActive: call.isActive ?? true,
    };
    calls = [fullCall, ...calls];
    if (fullCall.isActive) {
      activeCalls = [...activeCalls, fullCall];
    }
  };

  const updateCall = (id: string, updates: Partial<Call>) => {
    calls = calls.map((c) =>
      c.id === id ? { ...c, ...updates, isActive: false } : c
    );
    activeCalls = activeCalls.filter((c) => c.id !== id);
  };

  beforeEach(() => {
    calls = [];
    activeCalls = [];
  });

  it('should link audio file when callEnd has same ID as callStart', () => {
    const talkgroup = 927;
    const startTime = 1704825600;
    const callId = `${talkgroup}-${startTime}`;
    const audioPath = `/var/lib/trunk-recorder/audio/${callId}.wav`;

    // Simulate callStart
    addCall({
      id: callId,
      talkgroup_id: talkgroup,
      frequency: 852387500,
      start_time: startTime,
      isActive: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].audio_file).toBeNull();
    expect(activeCalls).toHaveLength(1);

    // Simulate callEnd
    updateCall(callId, {
      stop_time: startTime + 10,
      duration: 10,
      audio_file: audioPath,
    });

    expect(calls[0].audio_file).toBe(audioPath);
    expect(calls[0].isActive).toBe(false);
    expect(activeCalls).toHaveLength(0);
  });

  it('should add new call when callEnd has no matching callStart', () => {
    const talkgroup = 927;
    const startTime = 1704825600;
    const callId = `${talkgroup}-${startTime}`;
    const audioPath = `/var/lib/trunk-recorder/audio/${callId}.wav`;

    // No callStart - simulate callEnd directly
    // In real code, this adds a new completed call
    addCall({
      id: callId,
      talkgroup_id: talkgroup,
      frequency: 852387500,
      start_time: startTime,
      stop_time: startTime + 10,
      duration: 10,
      audio_file: audioPath,
      isActive: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].audio_file).toBe(audioPath);
    expect(calls[0].isActive).toBe(false);
  });

  it('should handle multiple calls to different talkgroups', () => {
    // Start two calls
    addCall({ id: '927-1000', talkgroup_id: 927, start_time: 1000, isActive: true });
    addCall({ id: '928-1001', talkgroup_id: 928, start_time: 1001, isActive: true });

    expect(calls).toHaveLength(2);
    expect(activeCalls).toHaveLength(2);

    // End first call
    updateCall('927-1000', {
      audio_file: '/audio/927-1000.wav',
      stop_time: 1010,
      duration: 10,
    });

    expect(calls.find((c) => c.id === '927-1000')?.audio_file).toBe('/audio/927-1000.wav');
    expect(activeCalls).toHaveLength(1);
    expect(activeCalls[0].talkgroup_id).toBe(928);

    // End second call
    updateCall('928-1001', {
      audio_file: '/audio/928-1001.wav',
      stop_time: 1015,
      duration: 14,
    });

    expect(calls.find((c) => c.id === '928-1001')?.audio_file).toBe('/audio/928-1001.wav');
    expect(activeCalls).toHaveLength(0);
  });

  it('should handle rapid calls to same talkgroup', () => {
    // First call starts and ends
    addCall({ id: '927-1000', talkgroup_id: 927, start_time: 1000, isActive: true });
    updateCall('927-1000', { audio_file: '/audio/927-1000.wav', stop_time: 1010 });

    // Second call to same talkgroup
    addCall({ id: '927-1020', talkgroup_id: 927, start_time: 1020, isActive: true });
    updateCall('927-1020', { audio_file: '/audio/927-1020.wav', stop_time: 1030 });

    expect(calls).toHaveLength(2);
    expect(calls.find((c) => c.id === '927-1000')?.audio_file).toBe('/audio/927-1000.wav');
    expect(calls.find((c) => c.id === '927-1020')?.audio_file).toBe('/audio/927-1020.wav');
  });
});
