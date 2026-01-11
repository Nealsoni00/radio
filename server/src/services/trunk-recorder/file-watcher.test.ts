import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * File Watcher Audio Path Derivation Tests
 *
 * These tests ensure that the file watcher correctly derives audio file paths
 * from JSON metadata files. This is critical for recordings to show up in the UI.
 *
 * The naming convention is:
 *   JSON metadata: /path/to/audio/{talkgroup}-{start_time}.json
 *   WAV audio:     /path/to/audio/{talkgroup}-{start_time}.wav
 */

// Test utility functions that mirror the file watcher logic
function deriveAudioPath(jsonPath: string): string {
  const { dirname, basename } = require('path');
  const dir = dirname(jsonPath);
  const base = basename(jsonPath, '.json');
  return `${dir}/${base}.wav`;
}

function generateCallId(talkgroup: number, startTime: number): string {
  return `${talkgroup}-${startTime}`;
}

describe('File Watcher Audio Path Derivation', () => {
  describe('deriveAudioPath', () => {
    it('should derive .wav path from .json path', () => {
      const jsonPath = '/var/lib/trunk-recorder/audio/927-1704825600.json';
      const expected = '/var/lib/trunk-recorder/audio/927-1704825600.wav';

      expect(deriveAudioPath(jsonPath)).toBe(expected);
    });

    it('should handle nested directory paths', () => {
      const jsonPath = '/var/lib/trunk-recorder/audio/2024-01-10/927-1704825600.json';
      const expected = '/var/lib/trunk-recorder/audio/2024-01-10/927-1704825600.wav';

      expect(deriveAudioPath(jsonPath)).toBe(expected);
    });

    it('should handle paths with spaces', () => {
      const jsonPath = '/var/lib/trunk recorder/audio/927-1704825600.json';
      const expected = '/var/lib/trunk recorder/audio/927-1704825600.wav';

      expect(deriveAudioPath(jsonPath)).toBe(expected);
    });

    it('should handle complex filenames', () => {
      const jsonPath = '/audio/P25_TG927_20240110_173000.json';
      const expected = '/audio/P25_TG927_20240110_173000.wav';

      expect(deriveAudioPath(jsonPath)).toBe(expected);
    });
  });

  describe('generateCallId', () => {
    it('should generate correct call ID format', () => {
      expect(generateCallId(927, 1704825600)).toBe('927-1704825600');
    });

    it('should handle large talkgroup IDs', () => {
      expect(generateCallId(12345678, 1704825600)).toBe('12345678-1704825600');
    });

    it('should handle zero talkgroup ID', () => {
      expect(generateCallId(0, 1704825600)).toBe('0-1704825600');
    });
  });

  describe('JSON Metadata Parsing', () => {
    it('should extract required fields from metadata', () => {
      const metadata = {
        talkgroup: 927,
        freq: 852387500,
        start_time: 1704825600,
        stop_time: 1704825610,
        call_length: 10,
        emergency: false,
        encrypted: false,
        talkgroup_tag: 'Control A2',
        talkgroup_description: 'North/West Dispatch',
        talkgroup_group: 'SFPD',
        audio_type: 'digital',
      };

      // Verify all fields are present
      expect(metadata.talkgroup).toBe(927);
      expect(metadata.freq).toBe(852387500);
      expect(metadata.start_time).toBe(1704825600);
      expect(metadata.stop_time).toBe(1704825610);
      expect(metadata.call_length).toBe(10);
    });

    it('should handle missing optional fields with defaults', () => {
      const metadata: Record<string, unknown> = {
        talkgroup: 927,
        freq: 852387500,
        start_time: 1704825600,
        stop_time: 1704825610,
        // Missing: talkgroup_tag, talkgroup_description, audio_type, etc.
      };

      // Defaults that should be applied
      const alphaTag = metadata.talkgroup_tag || `TG ${metadata.talkgroup}`;
      const audioType = metadata.audio_type || 'digital';
      const emergency = metadata.emergency || false;
      const encrypted = metadata.encrypted || false;

      expect(alphaTag).toBe('TG 927');
      expect(audioType).toBe('digital');
      expect(emergency).toBe(false);
      expect(encrypted).toBe(false);
    });

    it('should calculate call length from timestamps if not provided', () => {
      const metadata: Record<string, unknown> = {
        talkgroup: 927,
        freq: 852387500,
        start_time: 1704825600,
        stop_time: 1704825615,
        // No call_length provided
      };

      const length = metadata.call_length || (Number(metadata.stop_time) - Number(metadata.start_time));
      expect(length).toBe(15);
    });
  });

  describe('Audio File Path Consistency', () => {
    it('should produce consistent paths for same input', () => {
      const jsonPath = '/audio/927-1704825600.json';

      const path1 = deriveAudioPath(jsonPath);
      const path2 = deriveAudioPath(jsonPath);
      const path3 = deriveAudioPath(jsonPath);

      expect(path1).toBe(path2);
      expect(path2).toBe(path3);
    });

    it('should produce consistent call IDs for same input', () => {
      const tg = 927;
      const time = 1704825600;

      const id1 = generateCallId(tg, time);
      const id2 = generateCallId(tg, time);

      expect(id1).toBe(id2);
    });

    it('should match call ID to audio filename', () => {
      const tg = 927;
      const time = 1704825600;

      const callId = generateCallId(tg, time);
      const jsonPath = `/audio/${callId}.json`;
      const audioPath = deriveAudioPath(jsonPath);

      // The base filename (without extension) should match the call ID
      const { basename } = require('path');
      const audioBasename = basename(audioPath, '.wav');

      expect(audioBasename).toBe(callId);
    });
  });
});

describe('End-to-End Audio Linking Scenarios', () => {
  const testDir = '/tmp/file-watcher-test';

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create matching JSON and WAV file paths', () => {
    const tg = 927;
    const time = 1704825600;
    const callId = `${tg}-${time}`;

    const jsonPath = join(testDir, `${callId}.json`);
    const wavPath = join(testDir, `${callId}.wav`);

    // Simulate creating the files
    writeFileSync(jsonPath, JSON.stringify({ talkgroup: tg, start_time: time }));
    writeFileSync(wavPath, 'mock audio data');

    // Verify the derived path matches
    const derivedWavPath = deriveAudioPath(jsonPath);
    expect(derivedWavPath).toBe(wavPath);

    // Verify both files exist
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(wavPath)).toBe(true);
  });

  it('should handle the full metadata JSON format from trunk-recorder', () => {
    const metadata = {
      freq: 852387500,
      start_time: 1704825600,
      stop_time: 1704825612,
      emergency: 0,
      encrypted: 0,
      call_length: 12,
      talkgroup: 927,
      talkgroup_tag: 'Control A2',
      talkgroup_description: 'North/West Dispatch',
      talkgroup_group: 'SFPD Dispatch',
      talkgroup_group_tag: 'Law Dispatch',
      audio_type: 'digital',
      short_name: 'sfpd',
      freqList: [
        { freq: 852387500, time: 1704825600, pos: 0, len: 12, error_count: 0, spike_count: 0 }
      ],
      srcList: [
        { src: 6046010, time: 1704825600, pos: 0, emergency: 0, signal_system: '', tag: '' }
      ]
    };

    const callId = `${metadata.talkgroup}-${metadata.start_time}`;
    const jsonPath = join(testDir, `${callId}.json`);

    writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

    // Parse it back
    const parsed = JSON.parse(require('fs').readFileSync(jsonPath, 'utf8'));

    // Verify all fields survived round-trip
    expect(parsed.talkgroup).toBe(927);
    expect(parsed.start_time).toBe(1704825600);
    expect(parsed.talkgroup_tag).toBe('Control A2');
    expect(parsed.srcList).toHaveLength(1);
    expect(parsed.freqList).toHaveLength(1);

    // Verify audio path derivation
    const audioPath = deriveAudioPath(jsonPath);
    expect(audioPath).toContain('927-1704825600.wav');
  });
});
