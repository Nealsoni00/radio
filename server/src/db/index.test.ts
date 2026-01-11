import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { dirname } from 'path';

// Create a test database module
const testDbPath = '/tmp/radio-test-db/test.db';
const testDbDir = dirname(testDbPath);

// Test database setup
let db: ReturnType<typeof Database>;

function initTestDatabase() {
  if (!existsSync(testDbDir)) {
    mkdirSync(testDbDir, { recursive: true });
  }

  db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS talkgroups (
      id INTEGER PRIMARY KEY,
      alpha_tag TEXT NOT NULL,
      description TEXT,
      group_name TEXT,
      group_tag TEXT,
      mode TEXT DEFAULT 'D',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      talkgroup_id INTEGER NOT NULL,
      frequency INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      stop_time INTEGER,
      duration REAL,
      emergency INTEGER DEFAULT 0,
      encrypted INTEGER DEFAULT 0,
      audio_file TEXT,
      audio_type TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (talkgroup_id) REFERENCES talkgroups(id)
    );

    CREATE TABLE IF NOT EXISTS call_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      position REAL,
      emergency INTEGER DEFAULT 0,
      tag TEXT,
      FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY,
      tag TEXT,
      agency TEXT,
      last_seen INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

function upsertTalkgroup(
  id: number,
  alphaTag: string,
  description: string | null,
  groupName: string | null,
  groupTag: string | null,
  mode: string = 'D'
): void {
  const stmt = db.prepare(`
    INSERT INTO talkgroups (id, alpha_tag, description, group_name, group_tag, mode, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      alpha_tag = excluded.alpha_tag,
      description = excluded.description,
      group_name = excluded.group_name,
      group_tag = excluded.group_tag,
      mode = excluded.mode,
      updated_at = unixepoch()
  `);
  stmt.run(id, alphaTag, description, groupName, groupTag, mode);
}

function insertCall(call: {
  id: string;
  talkgroupId: number;
  frequency: number;
  startTime: number;
  stopTime?: number;
  duration?: number;
  emergency?: boolean;
  encrypted?: boolean;
  audioFile?: string;
  audioType?: string;
}): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO calls (
      id, talkgroup_id, frequency, start_time, stop_time, duration,
      emergency, encrypted, audio_file, audio_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    call.id,
    call.talkgroupId,
    call.frequency,
    call.startTime,
    call.stopTime ?? null,
    call.duration ?? null,
    call.emergency ? 1 : 0,
    call.encrypted ? 1 : 0,
    call.audioFile ?? null,
    call.audioType ?? null
  );
}

function insertCallSources(callId: string, sources: Array<{
  src: number;
  time: number;
  pos: number;
  emergency: boolean;
  tag: string;
}>): void {
  const stmt = db.prepare(`
    INSERT INTO call_sources (call_id, source_id, timestamp, position, emergency, tag)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((sources) => {
    for (const source of sources) {
      stmt.run(callId, source.src, source.time, source.pos, source.emergency ? 1 : 0, source.tag);
    }
  });

  insertMany(sources);
}

function getCalls(options: {
  limit?: number;
  offset?: number;
  talkgroupId?: number;
  since?: number;
  emergency?: boolean;
} = {}): any[] {
  const { limit = 50, offset = 0, talkgroupId, since, emergency } = options;

  let query = `
    SELECT
      c.*,
      t.alpha_tag,
      t.description as talkgroup_description,
      t.group_name,
      t.group_tag
    FROM calls c
    LEFT JOIN talkgroups t ON c.talkgroup_id = t.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (talkgroupId !== undefined) {
    query += ` AND c.talkgroup_id = ?`;
    params.push(talkgroupId);
  }
  if (since !== undefined) {
    query += ` AND c.start_time > ?`;
    params.push(since);
  }
  if (emergency !== undefined) {
    query += ` AND c.emergency = ?`;
    params.push(emergency ? 1 : 0);
  }

  query += ` ORDER BY c.start_time DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getCall(id: string): any {
  return db.prepare(`
    SELECT
      c.*,
      t.alpha_tag,
      t.description as talkgroup_description,
      t.group_name,
      t.group_tag
    FROM calls c
    LEFT JOIN talkgroups t ON c.talkgroup_id = t.id
    WHERE c.id = ?
  `).get(id);
}

function getCallSources(callId: string): any[] {
  return db.prepare(`
    SELECT cs.*, u.tag as unit_tag
    FROM call_sources cs
    LEFT JOIN units u ON cs.source_id = u.id
    WHERE cs.call_id = ?
    ORDER BY cs.position
  `).all(callId);
}

function getTalkgroups(): any[] {
  return db.prepare(`
    SELECT * FROM talkgroups ORDER BY group_name, alpha_tag
  `).all();
}

function getTalkgroup(id: number): any {
  return db.prepare(`SELECT * FROM talkgroups WHERE id = ?`).get(id);
}

describe('Database Functions', () => {
  beforeAll(() => {
    initTestDatabase();
  });

  afterAll(() => {
    db.close();
    try {
      rmSync(testDbDir, { recursive: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Clean up tables before each test
    db.exec('DELETE FROM call_sources');
    db.exec('DELETE FROM calls');
    db.exec('DELETE FROM talkgroups');
  });

  describe('upsertTalkgroup', () => {
    it('should insert a new talkgroup', () => {
      upsertTalkgroup(3219, 'PHX PD DISP 1', 'Phoenix PD Dispatch 1', 'Phoenix PD', 'Law Dispatch', 'D');

      const tg = getTalkgroup(3219);
      expect(tg).not.toBeNull();
      expect(tg.id).toBe(3219);
      expect(tg.alpha_tag).toBe('PHX PD DISP 1');
      expect(tg.description).toBe('Phoenix PD Dispatch 1');
      expect(tg.group_name).toBe('Phoenix PD');
      expect(tg.group_tag).toBe('Law Dispatch');
      expect(tg.mode).toBe('D');
    });

    it('should update an existing talkgroup', () => {
      upsertTalkgroup(3219, 'PHX PD DISP 1', null, null, null, 'D');
      upsertTalkgroup(3219, 'PHX PD DISP 1 Updated', 'Updated description', 'Phoenix PD', 'Law Tac', 'D');

      const tg = getTalkgroup(3219);
      expect(tg.alpha_tag).toBe('PHX PD DISP 1 Updated');
      expect(tg.description).toBe('Updated description');
      expect(tg.group_tag).toBe('Law Tac');
    });

    it('should handle null values', () => {
      upsertTalkgroup(1234, 'Test TG', null, null, null, 'D');

      const tg = getTalkgroup(1234);
      expect(tg.description).toBeNull();
      expect(tg.group_name).toBeNull();
      expect(tg.group_tag).toBeNull();
    });
  });

  describe('insertCall', () => {
    beforeEach(() => {
      // Insert a talkgroup for foreign key
      upsertTalkgroup(3219, 'PHX PD DISP 1', null, 'Phoenix PD', 'Law Dispatch', 'D');
    });

    it('should insert a new call', () => {
      insertCall({
        id: 'call_001',
        talkgroupId: 3219,
        frequency: 771356250,
        startTime: 1704825600,
        stopTime: 1704825610,
        duration: 10.5,
        emergency: false,
        encrypted: false,
        audioFile: '/audio/call_001.wav',
        audioType: 'wav',
      });

      const call = getCall('call_001');
      expect(call).not.toBeNull();
      expect(call.id).toBe('call_001');
      expect(call.talkgroup_id).toBe(3219);
      expect(call.frequency).toBe(771356250);
      expect(call.duration).toBe(10.5);
      expect(call.emergency).toBe(0);
      expect(call.audio_file).toBe('/audio/call_001.wav');
    });

    it('should replace an existing call with same id', () => {
      insertCall({
        id: 'call_001',
        talkgroupId: 3219,
        frequency: 771356250,
        startTime: 1704825600,
        duration: 5,
      });

      insertCall({
        id: 'call_001',
        talkgroupId: 3219,
        frequency: 771356250,
        startTime: 1704825600,
        duration: 15,
      });

      const call = getCall('call_001');
      expect(call.duration).toBe(15);
    });

    it('should handle emergency calls', () => {
      insertCall({
        id: 'call_emergency',
        talkgroupId: 3219,
        frequency: 771356250,
        startTime: 1704825600,
        emergency: true,
      });

      const call = getCall('call_emergency');
      expect(call.emergency).toBe(1);
    });

    it('should handle encrypted calls', () => {
      insertCall({
        id: 'call_encrypted',
        talkgroupId: 3219,
        frequency: 771356250,
        startTime: 1704825600,
        encrypted: true,
      });

      const call = getCall('call_encrypted');
      expect(call.encrypted).toBe(1);
    });
  });

  describe('insertCallSources', () => {
    beforeEach(() => {
      upsertTalkgroup(3219, 'PHX PD DISP 1', null, null, null, 'D');
      insertCall({
        id: 'call_with_sources',
        talkgroupId: 3219,
        frequency: 771356250,
        startTime: 1704825600,
      });
    });

    it('should insert call sources', () => {
      const sources = [
        { src: 12345, time: 1704825600, pos: 0, emergency: false, tag: 'Unit 1' },
        { src: 12346, time: 1704825602, pos: 2.5, emergency: false, tag: 'Unit 2' },
        { src: 12347, time: 1704825605, pos: 5.0, emergency: true, tag: 'Unit 3' },
      ];

      insertCallSources('call_with_sources', sources);

      const retrieved = getCallSources('call_with_sources');
      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].source_id).toBe(12345);
      expect(retrieved[1].source_id).toBe(12346);
      expect(retrieved[2].source_id).toBe(12347);
      expect(retrieved[2].emergency).toBe(1);
    });
  });

  describe('getCalls', () => {
    beforeEach(() => {
      upsertTalkgroup(3219, 'PHX PD DISP 1', 'Phoenix PD Dispatch', 'Phoenix PD', 'Law Dispatch', 'D');
      upsertTalkgroup(4567, 'PHX FIRE DISP', 'Phoenix Fire Dispatch', 'Phoenix Fire', 'Fire Dispatch', 'D');

      // Insert multiple calls
      for (let i = 0; i < 10; i++) {
        insertCall({
          id: `call_${i.toString().padStart(3, '0')}`,
          talkgroupId: i % 2 === 0 ? 3219 : 4567,
          frequency: 771356250,
          startTime: 1704825600 + i * 100,
          duration: 10 + i,
          emergency: i === 5,
        });
      }
    });

    it('should return calls with default limit', () => {
      const calls = getCalls();
      expect(calls.length).toBeLessThanOrEqual(50);
    });

    it('should respect limit parameter', () => {
      const calls = getCalls({ limit: 5 });
      expect(calls).toHaveLength(5);
    });

    it('should filter by talkgroup', () => {
      const calls = getCalls({ talkgroupId: 3219 });
      expect(calls.every(c => c.talkgroup_id === 3219)).toBe(true);
    });

    it('should filter by emergency', () => {
      const calls = getCalls({ emergency: true });
      expect(calls).toHaveLength(1);
      expect(calls[0].emergency).toBe(1);
    });

    it('should filter by since timestamp', () => {
      const calls = getCalls({ since: 1704825600 + 500 });
      expect(calls.every(c => c.start_time > 1704825600 + 500)).toBe(true);
    });

    it('should include talkgroup join fields', () => {
      const calls = getCalls({ limit: 1 });
      expect(calls[0].alpha_tag).toBeDefined();
      expect(calls[0].group_name).toBeDefined();
    });

    it('should order by start_time descending', () => {
      const calls = getCalls({ limit: 3 });
      expect(calls[0].start_time).toBeGreaterThan(calls[1].start_time);
      expect(calls[1].start_time).toBeGreaterThan(calls[2].start_time);
    });
  });

  describe('getTalkgroups', () => {
    beforeEach(() => {
      upsertTalkgroup(3219, 'PHX PD DISP 1', null, 'Phoenix PD', 'Law Dispatch', 'D');
      upsertTalkgroup(3220, 'PHX PD TAC 1', null, 'Phoenix PD', 'Law Tac', 'D');
      upsertTalkgroup(4567, 'PHX FIRE DISP', null, 'Phoenix Fire', 'Fire Dispatch', 'D');
    });

    it('should return all talkgroups', () => {
      const tgs = getTalkgroups();
      expect(tgs).toHaveLength(3);
    });

    it('should order by group_name and alpha_tag', () => {
      const tgs = getTalkgroups();
      // Phoenix Fire comes before Phoenix PD alphabetically
      expect(tgs[0].group_name).toBe('Phoenix Fire');
      expect(tgs[1].group_name).toBe('Phoenix PD');
    });
  });

  /**
   * Audio File Linking Tests
   *
   * These tests ensure that audio files are always properly linked to calls.
   * If these tests fail, recordings may exist on disk but not show up in the UI.
   */
  describe('Audio File Linking', () => {
    beforeEach(() => {
      upsertTalkgroup(927, 'Control A2', 'North/West Dispatch', 'SFPD', 'Law Dispatch', 'D');
      upsertTalkgroup(812, 'EMS Dispatch', 'EMS Dispatch', 'SFFD', 'Fire Dispatch', 'D');
    });

    it('should store audio_file path when inserting a call', () => {
      const audioPath = '/var/lib/trunk-recorder/audio/927-1704825600.wav';

      insertCall({
        id: '927-1704825600',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825600,
        stopTime: 1704825610,
        duration: 10,
        audioFile: audioPath,
        audioType: 'digital',
      });

      const call = getCall('927-1704825600');
      expect(call).not.toBeNull();
      expect(call.audio_file).toBe(audioPath);
      expect(call.audio_type).toBe('digital');
    });

    it('should return audio_file in getCalls results', () => {
      const audioPath = '/var/lib/trunk-recorder/audio/927-1704825600.wav';

      insertCall({
        id: '927-1704825600',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825600,
        audioFile: audioPath,
      });

      const calls = getCalls({ talkgroupId: 927 });
      expect(calls).toHaveLength(1);
      expect(calls[0].audio_file).toBe(audioPath);
    });

    it('should handle calls without audio files (audio_file = null)', () => {
      insertCall({
        id: '927-1704825700',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825700,
        // No audioFile provided
      });

      const call = getCall('927-1704825700');
      expect(call).not.toBeNull();
      expect(call.audio_file).toBeNull();
    });

    it('should preserve audio_file when upserting a call with INSERT OR REPLACE', () => {
      const audioPath = '/var/lib/trunk-recorder/audio/927-1704825600.wav';

      // First insert with audio file
      insertCall({
        id: '927-1704825600',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825600,
        duration: 5,
        audioFile: audioPath,
      });

      // Second insert with same ID should replace and keep audio file if provided
      insertCall({
        id: '927-1704825600',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825600,
        duration: 10,
        audioFile: audioPath, // Must re-provide audio file
      });

      const call = getCall('927-1704825600');
      expect(call.duration).toBe(10);
      expect(call.audio_file).toBe(audioPath);
    });

    it('should correctly link multiple calls with different audio files', () => {
      const calls = [
        { id: '927-1704825600', talkgroupId: 927, audioPath: '/audio/927-1704825600.wav' },
        { id: '927-1704825700', talkgroupId: 927, audioPath: '/audio/927-1704825700.wav' },
        { id: '812-1704825650', talkgroupId: 812, audioPath: '/audio/812-1704825650.wav' },
      ];

      calls.forEach(c => {
        insertCall({
          id: c.id,
          talkgroupId: c.talkgroupId,
          frequency: 852387500,
          startTime: parseInt(c.id.split('-')[1]),
          audioFile: c.audioPath,
        });
      });

      // Verify each call has the correct audio file
      calls.forEach(c => {
        const call = getCall(c.id);
        expect(call.audio_file).toBe(c.audioPath);
      });

      // Verify getCalls returns all audio files
      const allCalls = getCalls();
      expect(allCalls).toHaveLength(3);
      expect(allCalls.every(c => c.audio_file !== null)).toBe(true);
    });

    it('should handle audio files with special characters in path', () => {
      const audioPath = '/var/lib/trunk-recorder/audio/2024-01-10/TG 927 - Dispatch (1704825600).wav';

      insertCall({
        id: '927-1704825600',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825600,
        audioFile: audioPath,
      });

      const call = getCall('927-1704825600');
      expect(call.audio_file).toBe(audioPath);
    });

    it('should distinguish between calls with and without audio in query results', () => {
      // Call with audio
      insertCall({
        id: '927-1704825600',
        talkgroupId: 927,
        frequency: 852387500,
        startTime: 1704825600,
        audioFile: '/audio/927-1704825600.wav',
      });

      // Call without audio (e.g., out of band, encrypted, etc.)
      insertCall({
        id: '927-1704825700',
        talkgroupId: 927,
        frequency: 853650000, // Out of band frequency
        startTime: 1704825700,
        // No audio file
      });

      const calls = getCalls({ talkgroupId: 927 });
      expect(calls).toHaveLength(2);

      const callWithAudio = calls.find(c => c.id === '927-1704825600');
      const callWithoutAudio = calls.find(c => c.id === '927-1704825700');

      expect(callWithAudio?.audio_file).not.toBeNull();
      expect(callWithoutAudio?.audio_file).toBeNull();
    });
  });
});
