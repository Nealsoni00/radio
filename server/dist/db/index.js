import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config/index.js';
const dbPath = config.database.path;
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
}
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
export function initializeDatabase() {
    db.exec(`
    -- System configuration (stored in database for portal configuration)
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Insert default system type if not exists
    INSERT OR IGNORE INTO system_config (key, value) VALUES ('system_type', 'p25');
    INSERT OR IGNORE INTO system_config (key, value) VALUES ('system_short_name', 'default');

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

    -- Channels table for conventional systems (frequency-based)
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      frequency INTEGER NOT NULL UNIQUE,
      alpha_tag TEXT NOT NULL,
      description TEXT,
      group_name TEXT,
      group_tag TEXT,
      mode TEXT DEFAULT 'D',
      system_type TEXT DEFAULT 'conventional',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_channels_frequency ON channels(frequency);
    CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(group_name);

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      talkgroup_id INTEGER NOT NULL DEFAULT 0,
      frequency INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      stop_time INTEGER,
      duration REAL,
      emergency INTEGER DEFAULT 0,
      encrypted INTEGER DEFAULT 0,
      audio_file TEXT,
      audio_type TEXT,
      system_type TEXT DEFAULT 'trunked',
      channel_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
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

    CREATE INDEX IF NOT EXISTS idx_calls_start_time ON calls(start_time DESC);
    CREATE INDEX IF NOT EXISTS idx_calls_talkgroup ON calls(talkgroup_id);
    CREATE INDEX IF NOT EXISTS idx_calls_emergency ON calls(emergency) WHERE emergency = 1;
    CREATE INDEX IF NOT EXISTS idx_calls_system_type ON calls(system_type);
    CREATE INDEX IF NOT EXISTS idx_calls_channel ON calls(channel_id);
    CREATE INDEX IF NOT EXISTS idx_call_sources_call ON call_sources(call_id);
    CREATE INDEX IF NOT EXISTS idx_call_sources_source ON call_sources(source_id);

    -- RadioReference States
    CREATE TABLE IF NOT EXISTS rr_states (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      country_id INTEGER DEFAULT 1,
      last_synced INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rr_states_abbrev ON rr_states(abbreviation);

    -- RadioReference Counties
    CREATE TABLE IF NOT EXISTS rr_counties (
      id INTEGER PRIMARY KEY,
      state_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      last_synced INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (state_id) REFERENCES rr_states(id)
    );
    CREATE INDEX IF NOT EXISTS idx_rr_counties_state ON rr_counties(state_id);
    CREATE INDEX IF NOT EXISTS idx_rr_counties_name ON rr_counties(name);

    -- RadioReference P25 Trunked Systems
    CREATE TABLE IF NOT EXISTS rr_systems (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      flavor TEXT,
      voice TEXT,
      system_id TEXT,
      wacn TEXT,
      nac TEXT,
      rfss INTEGER,
      state_id INTEGER,
      county_id INTEGER,
      city TEXT,
      description TEXT,
      last_synced INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (state_id) REFERENCES rr_states(id),
      FOREIGN KEY (county_id) REFERENCES rr_counties(id)
    );
    CREATE INDEX IF NOT EXISTS idx_rr_systems_state ON rr_systems(state_id);
    CREATE INDEX IF NOT EXISTS idx_rr_systems_county ON rr_systems(county_id);
    CREATE INDEX IF NOT EXISTS idx_rr_systems_type ON rr_systems(type);
    CREATE INDEX IF NOT EXISTS idx_rr_systems_name ON rr_systems(name);

    -- RadioReference Sites (towers/repeaters)
    CREATE TABLE IF NOT EXISTS rr_sites (
      id INTEGER PRIMARY KEY,
      system_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      rfss INTEGER,
      site_id INTEGER,
      county_id INTEGER,
      latitude REAL,
      longitude REAL,
      range_miles REAL,
      last_synced INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (system_id) REFERENCES rr_systems(id) ON DELETE CASCADE,
      FOREIGN KEY (county_id) REFERENCES rr_counties(id)
    );
    CREATE INDEX IF NOT EXISTS idx_rr_sites_system ON rr_sites(system_id);

    -- RadioReference Frequencies
    CREATE TABLE IF NOT EXISTS rr_frequencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      system_id INTEGER NOT NULL,
      frequency INTEGER NOT NULL,
      channel_type TEXT NOT NULL DEFAULT 'voice',
      lcn INTEGER,
      is_primary INTEGER DEFAULT 0,
      last_synced INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (site_id) REFERENCES rr_sites(id) ON DELETE CASCADE,
      FOREIGN KEY (system_id) REFERENCES rr_systems(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rr_frequencies_site ON rr_frequencies(site_id);
    CREATE INDEX IF NOT EXISTS idx_rr_frequencies_system ON rr_frequencies(system_id);
    CREATE INDEX IF NOT EXISTS idx_rr_frequencies_freq ON rr_frequencies(frequency);

    -- RadioReference Talkgroups
    CREATE TABLE IF NOT EXISTS rr_talkgroups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_id INTEGER NOT NULL,
      talkgroup_id INTEGER NOT NULL,
      alpha_tag TEXT,
      description TEXT,
      mode TEXT,
      category TEXT,
      tag TEXT,
      last_synced INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(system_id, talkgroup_id),
      FOREIGN KEY (system_id) REFERENCES rr_systems(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_system ON rr_talkgroups(system_id);
    CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_tgid ON rr_talkgroups(talkgroup_id);
    CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_tag ON rr_talkgroups(tag);

    -- Sync Progress Tracking
    CREATE TABLE IF NOT EXISTS rr_sync_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      parent_id INTEGER,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rr_sync_status ON rr_sync_progress(entity_type, status);

    -- User Selected Systems
    CREATE TABLE IF NOT EXISTS user_selected_systems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (system_id) REFERENCES rr_systems(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_selected_unique ON user_selected_systems(system_id);
  `);
    // Create FTS5 virtual table for fuzzy search (separate exec to handle IF NOT EXISTS)
    try {
        db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS rr_search USING fts5(
        system_name,
        system_type,
        talkgroup_alpha_tag,
        talkgroup_description,
        category,
        tag,
        state_name,
        state_abbrev,
        county_name,
        city,
        content='',
        tokenize='trigram'
      );
    `);
    }
    catch (e) {
        // FTS5 table may already exist
    }
    console.log('Database initialized');
}
export function upsertTalkgroup(id, alphaTag, description, groupName, groupTag, mode = 'D') {
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
// =============================================================================
// Channel Functions (for conventional systems)
// =============================================================================
export function upsertChannel(frequency, alphaTag, description = null, groupName = null, groupTag = null, mode = 'D', systemType = 'conventional') {
    const stmt = db.prepare(`
    INSERT INTO channels (frequency, alpha_tag, description, group_name, group_tag, mode, system_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(frequency) DO UPDATE SET
      alpha_tag = excluded.alpha_tag,
      description = excluded.description,
      group_name = excluded.group_name,
      group_tag = excluded.group_tag,
      mode = excluded.mode,
      system_type = excluded.system_type,
      updated_at = unixepoch()
    RETURNING id
  `);
    const result = stmt.get(frequency, alphaTag, description, groupName, groupTag, mode, systemType);
    return result.id;
}
export function getChannelByFrequency(frequency) {
    return db.prepare(`SELECT * FROM channels WHERE frequency = ?`).get(frequency);
}
export function getChannels() {
    return db.prepare(`SELECT * FROM channels ORDER BY group_name, alpha_tag`).all();
}
export function getOrCreateChannel(frequency, alphaTag, groupName) {
    // Check if channel exists
    const existing = getChannelByFrequency(frequency);
    if (existing) {
        return existing.id;
    }
    // Create new channel with frequency as default name
    const defaultTag = alphaTag || `${(frequency / 1e6).toFixed(4)} MHz`;
    return upsertChannel(frequency, defaultTag, null, groupName || 'Unknown', null);
}
export function insertCall(call) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO calls (
      id, talkgroup_id, frequency, start_time, stop_time, duration,
      emergency, encrypted, audio_file, audio_type, system_type, channel_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(call.id, call.talkgroupId, call.frequency, call.startTime, call.stopTime ?? null, call.duration ?? null, call.emergency ? 1 : 0, call.encrypted ? 1 : 0, call.audioFile ?? null, call.audioType ?? null, call.systemType ?? 'trunked', call.channelId ?? null);
}
export function insertCallSources(callId, sources) {
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
export function getCalls(options = {}) {
    const { limit = 50, offset = 0, talkgroupId, channelId, frequency, systemType, since, emergency } = options;
    // Join on both talkgroups (for trunked) and channels (for conventional)
    // Use COALESCE to get alpha_tag from whichever is available
    let query = `
    SELECT
      c.*,
      COALESCE(t.alpha_tag, ch.alpha_tag) as alpha_tag,
      COALESCE(t.description, ch.description) as talkgroup_description,
      COALESCE(t.group_name, ch.group_name) as group_name,
      COALESCE(t.group_tag, ch.group_tag) as group_tag
    FROM calls c
    LEFT JOIN talkgroups t ON c.talkgroup_id = t.id AND c.system_type = 'trunked'
    LEFT JOIN channels ch ON c.channel_id = ch.id AND c.system_type = 'conventional'
    WHERE 1=1
  `;
    const params = [];
    if (talkgroupId !== undefined) {
        query += ` AND c.talkgroup_id = ?`;
        params.push(talkgroupId);
    }
    if (channelId !== undefined) {
        query += ` AND c.channel_id = ?`;
        params.push(channelId);
    }
    if (frequency !== undefined) {
        query += ` AND c.frequency = ?`;
        params.push(frequency);
    }
    if (systemType !== undefined) {
        query += ` AND c.system_type = ?`;
        params.push(systemType);
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
export function getCall(id) {
    return db.prepare(`
    SELECT
      c.*,
      COALESCE(t.alpha_tag, ch.alpha_tag) as alpha_tag,
      COALESCE(t.description, ch.description) as talkgroup_description,
      COALESCE(t.group_name, ch.group_name) as group_name,
      COALESCE(t.group_tag, ch.group_tag) as group_tag
    FROM calls c
    LEFT JOIN talkgroups t ON c.talkgroup_id = t.id AND c.system_type = 'trunked'
    LEFT JOIN channels ch ON c.channel_id = ch.id AND c.system_type = 'conventional'
    WHERE c.id = ?
  `).get(id);
}
export function getCallSources(callId) {
    return db.prepare(`
    SELECT cs.*, u.tag as unit_tag
    FROM call_sources cs
    LEFT JOIN units u ON cs.source_id = u.id
    WHERE cs.call_id = ?
    ORDER BY cs.position
  `).all(callId);
}
export function getTalkgroups() {
    return db.prepare(`
    SELECT * FROM talkgroups ORDER BY group_name, alpha_tag
  `).all();
}
export function getTalkgroup(id) {
    return db.prepare(`SELECT * FROM talkgroups WHERE id = ?`).get(id);
}
export function getSystemConfigValue(key) {
    const row = db.prepare(`SELECT value FROM system_config WHERE key = ?`).get(key);
    return row?.value ?? null;
}
export function setSystemConfigValue(key, value) {
    db.prepare(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = unixepoch()
  `).run(key, value);
}
export function getAllSystemConfig() {
    const rows = db.prepare(`SELECT key, value FROM system_config`).all();
    const config = {};
    for (const row of rows) {
        config[row.key] = row.value;
    }
    return config;
}
export function getSystemType() {
    return getSystemConfigValue('system_type') ?? 'p25';
}
export function setSystemType(type) {
    setSystemConfigValue('system_type', type);
}
export function getSystemShortName() {
    return getSystemConfigValue('system_short_name') ?? 'default';
}
export function setSystemShortName(name) {
    setSystemConfigValue('system_short_name', name);
}
export function isConventionalSystemFromDB() {
    const type = getSystemType();
    return type === 'conventional' || type === 'p25_conventional' || type === 'conventionalP25' || type === 'conventionalDMR';
}
//# sourceMappingURL=index.js.map