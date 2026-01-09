import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogWatcher, ControlChannelEvent } from './log-watcher.js';

describe('LogWatcher', () => {
  let logWatcher: LogWatcher;

  beforeEach(() => {
    logWatcher = new LogWatcher('/tmp/test.log');
  });

  afterEach(() => {
    logWatcher.stop();
  });

  describe('parseLine', () => {
    // Access the private method for testing
    const parseLine = (watcher: LogWatcher, line: string): ControlChannelEvent | null => {
      return (watcher as any).parseLine(line);
    };

    it('should parse channel grant events', () => {
      const line = '[2026-01-09 12:00:00.123] Starting P25 Recorder TG: 3219 Freq: 771.3563 MHz Recorder Num [0] TDMA: false Slot: 0';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('grant');
      expect(event?.talkgroup).toBe(3219);
      expect(event?.frequency).toBe(771356300);
      expect(event?.recorder).toBe(0);
      expect(event?.tdma).toBe(false);
      expect(event?.slot).toBe(0);
    });

    it('should parse channel update events', () => {
      const line = '[2026-01-09 12:00:00.123] Starting P25 Recorder UPDATE TG: 1234 Freq: 770.1063 MHz';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('update');
      expect(event?.talkgroup).toBe(1234);
    });

    it('should parse call end events', () => {
      const line = '[2026-01-09 12:00:00.123] Stopping P25 Recorder TG: 3219 Freq: 771.3563 MHz Recorder Num [0]';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('end');
      expect(event?.talkgroup).toBe(3219);
    });

    it('should parse concluding recorded call events', () => {
      const line = '[2026-01-09 12:00:00.123] Concluding Recorded Call TG: 5678';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('end');
      expect(event?.talkgroup).toBe(5678);
    });

    it('should parse encrypted events', () => {
      const line = '[2026-01-09 12:00:00.123] ENCRYPTED TG: 9999 src: 12345';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('encrypted');
      expect(event?.talkgroup).toBe(9999);
      expect(event?.unitId).toBe(12345);
    });

    it('should parse out of band events', () => {
      const line = '[2026-01-09 12:00:00.123] Not Recording: no source covering Freq TG: 1795 Freq: 772.6063 MHz';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('out_of_band');
      expect(event?.talkgroup).toBe(1795);
      expect(event?.frequency).toBe(772606300);
    });

    it('should parse no recorder available events', () => {
      const line = '[2026-01-09 12:00:00.123] No Digital Recorders Available TG: 4567 Freq: 771.0000 MHz';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('no_recorder');
      expect(event?.talkgroup).toBe(4567);
    });

    it('should parse decode rate events', () => {
      const line = '[2026-01-09 12:00:00.123] Control Channel Message Decode Rate: 25/sec count: 500';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('decode_rate');
      expect(event?.decodeRate).toBe(25);
    });

    it('should parse system ID events', () => {
      const line = '[2026-01-09 12:00:00.123] Decoding System ID 534 WACN: BEE08 NAC: 6B2';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('system_info');
      expect(event?.systemId).toBe(534);
      expect(event?.wacn).toBe('BEE08');
      expect(event?.nac).toBe('6B2');
    });

    it('should parse site info events', () => {
      const line = '[2026-01-09 12:00:00.123] Decoding System Site RFSS: 1 SITE ID: 3';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('system_info');
      expect(event?.rfss).toBe(1);
      expect(event?.siteId).toBe(3);
    });

    it('should parse unit ID events', () => {
      const line = '[2026-01-09 12:00:00.123] Unit ID set via Control Channel TG: 3219 ext: 987654';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('unit');
      expect(event?.talkgroup).toBe(3219);
      expect(event?.unitId).toBe(987654);
    });

    it('should return null for unrecognized lines', () => {
      const line = '[2026-01-09 12:00:00.123] Some other log message';
      const event = parseLine(logWatcher, line);

      expect(event).toBeNull();
    });

    it('should strip ANSI color codes', () => {
      const line = '\x1b[32m[2026-01-09 12:00:00.123]\x1b[0m Starting P25 Recorder TG: 3219 Freq: 771.3563 MHz';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe('grant');
      expect(event?.talkgroup).toBe(3219);
    });

    it('should parse timestamp correctly', () => {
      const line = '[2026-01-09 15:30:45.123] Starting P25 Recorder TG: 3219 Freq: 771.3563 MHz';
      const event = parseLine(logWatcher, line);

      expect(event).not.toBeNull();
      expect(event?.timestamp).toBeInstanceOf(Date);
      expect(event?.timestamp.getFullYear()).toBe(2026);
      expect(event?.timestamp.getMonth()).toBe(0); // January is 0
      expect(event?.timestamp.getDate()).toBe(9);
    });
  });
});
