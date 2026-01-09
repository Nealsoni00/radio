import { db } from './index.js';
import type {
  RRState,
  RRCounty,
  RRSystem,
  RRSite,
  RRFrequency,
  RRTalkgroup,
  SystemSearchResult,
  TalkgroupSearchResult,
} from '../services/radioreference/types.js';

// State operations
export function upsertState(state: RRState): void {
  const stmt = db.prepare(`
    INSERT INTO rr_states (id, name, abbreviation, country_id, last_synced, updated_at)
    VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      abbreviation = excluded.abbreviation,
      last_synced = unixepoch(),
      updated_at = unixepoch()
  `);
  stmt.run(state.id, state.name, state.abbreviation, state.countryId);
}

export function getStates(): RRState[] {
  return db.prepare(`
    SELECT id, name, abbreviation, country_id as countryId
    FROM rr_states
    ORDER BY name
  `).all() as RRState[];
}

export function getState(id: number): RRState | undefined {
  return db.prepare(`
    SELECT id, name, abbreviation, country_id as countryId
    FROM rr_states WHERE id = ?
  `).get(id) as RRState | undefined;
}

// County operations
export function upsertCounty(county: RRCounty): void {
  const stmt = db.prepare(`
    INSERT INTO rr_counties (id, state_id, name, last_synced, updated_at)
    VALUES (?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      state_id = excluded.state_id,
      name = excluded.name,
      last_synced = unixepoch(),
      updated_at = unixepoch()
  `);
  stmt.run(county.id, county.stateId, county.name);
}

export function getCounties(stateId?: number): RRCounty[] {
  if (stateId) {
    return db.prepare(`
      SELECT id, state_id as stateId, name
      FROM rr_counties WHERE state_id = ?
      ORDER BY name
    `).all(stateId) as RRCounty[];
  }
  return db.prepare(`
    SELECT id, state_id as stateId, name
    FROM rr_counties ORDER BY name
  `).all() as RRCounty[];
}

export function getCounty(id: number): RRCounty | undefined {
  return db.prepare(`
    SELECT id, state_id as stateId, name
    FROM rr_counties WHERE id = ?
  `).get(id) as RRCounty | undefined;
}

// System operations
export function upsertSystem(system: RRSystem): void {
  const stmt = db.prepare(`
    INSERT INTO rr_systems (
      id, name, type, flavor, voice, system_id, wacn, nac, rfss,
      state_id, county_id, city, description, is_active, last_synced, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      flavor = excluded.flavor,
      voice = excluded.voice,
      system_id = excluded.system_id,
      wacn = excluded.wacn,
      nac = excluded.nac,
      rfss = excluded.rfss,
      state_id = excluded.state_id,
      county_id = excluded.county_id,
      city = excluded.city,
      description = excluded.description,
      is_active = excluded.is_active,
      last_synced = unixepoch(),
      updated_at = unixepoch()
  `);
  stmt.run(
    system.id,
    system.name,
    system.type,
    system.flavor ?? null,
    system.voice ?? null,
    system.systemId ?? null,
    system.wacn ?? null,
    system.nac ?? null,
    system.rfss ?? null,
    system.stateId,
    system.countyId ?? null,
    system.city ?? null,
    system.description ?? null,
    system.isActive ? 1 : 0
  );
}

export interface GetSystemsOptions {
  stateId?: number;
  countyId?: number;
  type?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export function getSystems(options: GetSystemsOptions = {}): { systems: SystemSearchResult[]; total: number } {
  const { stateId, countyId, type, limit = 50, offset = 0, search } = options;
  const params: (string | number)[] = [];
  let whereClause = 'WHERE 1=1';

  if (stateId) {
    whereClause += ' AND s.state_id = ?';
    params.push(stateId);
  }
  if (countyId) {
    whereClause += ' AND s.county_id = ?';
    params.push(countyId);
  }
  if (type) {
    whereClause += ' AND s.type LIKE ?';
    params.push(`%${type}%`);
  }
  if (search) {
    whereClause += ' AND (s.name LIKE ? OR st.name LIKE ? OR c.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countQuery = `
    SELECT COUNT(*) as total
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    ${whereClause}
  `;
  const { total } = db.prepare(countQuery).get(...params) as { total: number };

  const query = `
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as systemId,
      s.wacn, s.nac, s.rfss, s.state_id as stateId, s.county_id as countyId,
      s.city, s.description, s.is_active as isActive,
      st.name as stateName, st.abbreviation as stateAbbrev,
      c.name as countyName,
      (SELECT COUNT(*) FROM rr_talkgroups WHERE system_id = s.id) as talkgroupCount,
      (SELECT COUNT(*) FROM rr_sites WHERE system_id = s.id) as siteCount
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    ${whereClause}
    ORDER BY st.name, s.name
    LIMIT ? OFFSET ?
  `;

  const systems = db.prepare(query).all(...params, limit, offset) as SystemSearchResult[];
  return { systems, total };
}

export function getSystem(id: number): SystemSearchResult | undefined {
  return db.prepare(`
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as systemId,
      s.wacn, s.nac, s.rfss, s.state_id as stateId, s.county_id as countyId,
      s.city, s.description, s.is_active as isActive,
      st.name as stateName, st.abbreviation as stateAbbrev,
      c.name as countyName,
      (SELECT COUNT(*) FROM rr_talkgroups WHERE system_id = s.id) as talkgroupCount,
      (SELECT COUNT(*) FROM rr_sites WHERE system_id = s.id) as siteCount
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    WHERE s.id = ?
  `).get(id) as SystemSearchResult | undefined;
}

// Site operations
export function upsertSite(site: RRSite): void {
  const stmt = db.prepare(`
    INSERT INTO rr_sites (
      id, system_id, name, description, rfss, site_id, county_id,
      latitude, longitude, range_miles, last_synced, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      system_id = excluded.system_id,
      name = excluded.name,
      description = excluded.description,
      rfss = excluded.rfss,
      site_id = excluded.site_id,
      county_id = excluded.county_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      range_miles = excluded.range_miles,
      last_synced = unixepoch(),
      updated_at = unixepoch()
  `);
  stmt.run(
    site.id,
    site.systemId,
    site.name,
    site.description ?? null,
    site.rfss ?? null,
    site.siteId ?? null,
    site.countyId ?? null,
    site.latitude ?? null,
    site.longitude ?? null,
    site.rangeMiles ?? null
  );
}

export function getSites(systemId: number): RRSite[] {
  return db.prepare(`
    SELECT
      id, system_id as systemId, name, description, rfss, site_id as siteId,
      county_id as countyId, latitude, longitude, range_miles as rangeMiles
    FROM rr_sites WHERE system_id = ?
    ORDER BY name
  `).all(systemId) as RRSite[];
}

// Frequency operations
export function upsertFrequency(freq: RRFrequency): void {
  const stmt = db.prepare(`
    INSERT INTO rr_frequencies (
      site_id, system_id, frequency, channel_type, lcn, is_primary, last_synced
    ) VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(site_id, frequency) DO UPDATE SET
      channel_type = excluded.channel_type,
      lcn = excluded.lcn,
      is_primary = excluded.is_primary,
      last_synced = unixepoch()
  `);
  stmt.run(
    freq.siteId,
    freq.systemId,
    freq.frequency,
    freq.channelType,
    freq.lcn ?? null,
    freq.isPrimary ? 1 : 0
  );
}

export function insertFrequencies(frequencies: RRFrequency[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO rr_frequencies (
      site_id, system_id, frequency, channel_type, lcn, is_primary, last_synced
    ) VALUES (?, ?, ?, ?, ?, ?, unixepoch())
  `);

  const insertMany = db.transaction((freqs: RRFrequency[]) => {
    for (const f of freqs) {
      stmt.run(f.siteId, f.systemId, f.frequency, f.channelType, f.lcn ?? null, f.isPrimary ? 1 : 0);
    }
  });

  insertMany(frequencies);
}

export function getFrequencies(systemId: number): (RRFrequency & { siteName: string })[] {
  return db.prepare(`
    SELECT
      f.site_id as siteId, f.system_id as systemId, f.frequency,
      f.channel_type as channelType, f.lcn, f.is_primary as isPrimary,
      s.name as siteName
    FROM rr_frequencies f
    JOIN rr_sites s ON f.site_id = s.id
    WHERE f.system_id = ?
    ORDER BY s.name, f.is_primary DESC, f.frequency
  `).all(systemId) as (RRFrequency & { siteName: string })[];
}

// Talkgroup operations
export function upsertTalkgroup(tg: RRTalkgroup): void {
  const stmt = db.prepare(`
    INSERT INTO rr_talkgroups (
      system_id, talkgroup_id, alpha_tag, description, mode, category, tag, last_synced, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(system_id, talkgroup_id) DO UPDATE SET
      alpha_tag = excluded.alpha_tag,
      description = excluded.description,
      mode = excluded.mode,
      category = excluded.category,
      tag = excluded.tag,
      last_synced = unixepoch(),
      updated_at = unixepoch()
  `);
  stmt.run(
    tg.systemId,
    tg.talkgroupId,
    tg.alphaTag ?? null,
    tg.description ?? null,
    tg.mode ?? null,
    tg.category ?? null,
    tg.tag ?? null
  );
}

export function insertTalkgroups(talkgroups: RRTalkgroup[]): void {
  const stmt = db.prepare(`
    INSERT INTO rr_talkgroups (
      system_id, talkgroup_id, alpha_tag, description, mode, category, tag, last_synced, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    ON CONFLICT(system_id, talkgroup_id) DO UPDATE SET
      alpha_tag = excluded.alpha_tag,
      description = excluded.description,
      mode = excluded.mode,
      category = excluded.category,
      tag = excluded.tag,
      last_synced = unixepoch(),
      updated_at = unixepoch()
  `);

  const insertMany = db.transaction((tgs: RRTalkgroup[]) => {
    for (const tg of tgs) {
      stmt.run(tg.systemId, tg.talkgroupId, tg.alphaTag ?? null, tg.description ?? null, tg.mode ?? null, tg.category ?? null, tg.tag ?? null);
    }
  });

  insertMany(talkgroups);
}

export interface GetTalkgroupsOptions {
  systemId?: number;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export function getTalkgroups(options: GetTalkgroupsOptions = {}): { talkgroups: RRTalkgroup[]; total: number } {
  const { systemId, category, tag, limit = 100, offset = 0 } = options;
  const params: (string | number)[] = [];
  let whereClause = 'WHERE 1=1';

  if (systemId) {
    whereClause += ' AND system_id = ?';
    params.push(systemId);
  }
  if (category) {
    whereClause += ' AND category LIKE ?';
    params.push(`%${category}%`);
  }
  if (tag) {
    whereClause += ' AND tag LIKE ?';
    params.push(`%${tag}%`);
  }

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM rr_talkgroups ${whereClause}`).get(...params) as { total: number };

  const query = `
    SELECT
      system_id as systemId, talkgroup_id as talkgroupId, alpha_tag as alphaTag,
      description, mode, category, tag
    FROM rr_talkgroups
    ${whereClause}
    ORDER BY talkgroup_id
    LIMIT ? OFFSET ?
  `;

  const talkgroups = db.prepare(query).all(...params, limit, offset) as RRTalkgroup[];
  return { talkgroups, total };
}

// Search operations
export function searchSystems(query: string, options: { stateId?: number; type?: string; limit?: number } = {}): SystemSearchResult[] {
  const { stateId, type, limit = 20 } = options;
  const searchPattern = `%${query}%`;
  const params: (string | number)[] = [searchPattern, searchPattern, searchPattern, searchPattern];
  let whereClause = `
    WHERE (s.name LIKE ? OR s.city LIKE ? OR st.name LIKE ? OR c.name LIKE ?)
  `;

  if (stateId) {
    whereClause += ' AND s.state_id = ?';
    params.push(stateId);
  }
  if (type) {
    whereClause += ' AND s.type LIKE ?';
    params.push(`%${type}%`);
  }

  params.push(limit);

  return db.prepare(`
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as systemId,
      s.wacn, s.nac, s.rfss, s.state_id as stateId, s.county_id as countyId,
      s.city, s.description, s.is_active as isActive,
      st.name as stateName, st.abbreviation as stateAbbrev,
      c.name as countyName,
      (SELECT COUNT(*) FROM rr_talkgroups WHERE system_id = s.id) as talkgroupCount,
      (SELECT COUNT(*) FROM rr_sites WHERE system_id = s.id) as siteCount
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    ${whereClause}
    ORDER BY s.name
    LIMIT ?
  `).all(...params) as SystemSearchResult[];
}

export function searchTalkgroups(query: string, options: { systemId?: number; limit?: number } = {}): TalkgroupSearchResult[] {
  const { systemId, limit = 20 } = options;
  const searchPattern = `%${query}%`;
  const params: (string | number)[] = [searchPattern, searchPattern];
  let whereClause = 'WHERE (t.alpha_tag LIKE ? OR t.description LIKE ?)';

  if (systemId) {
    whereClause += ' AND t.system_id = ?';
    params.push(systemId);
  }

  params.push(limit);

  return db.prepare(`
    SELECT
      t.system_id as systemId, t.talkgroup_id as talkgroupId, t.alpha_tag as alphaTag,
      t.description, t.mode, t.category, t.tag,
      s.name as systemName, s.type as systemType,
      st.name as stateName, st.abbreviation as stateAbbrev,
      c.name as countyName
    FROM rr_talkgroups t
    JOIN rr_systems s ON t.system_id = s.id
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    ${whereClause}
    ORDER BY t.alpha_tag
    LIMIT ?
  `).all(...params) as TalkgroupSearchResult[];
}

// User selected systems
export function addSelectedSystem(systemId: number, priority = 0): void {
  db.prepare(`
    INSERT INTO user_selected_systems (system_id, priority, enabled)
    VALUES (?, ?, 1)
    ON CONFLICT(system_id) DO UPDATE SET priority = excluded.priority
  `).run(systemId, priority);
}

export function removeSelectedSystem(systemId: number): void {
  db.prepare('DELETE FROM user_selected_systems WHERE system_id = ?').run(systemId);
}

export function getSelectedSystems(): SystemSearchResult[] {
  return db.prepare(`
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as systemId,
      s.wacn, s.nac, s.rfss, s.state_id as stateId, s.county_id as countyId,
      s.city, s.description, s.is_active as isActive,
      st.name as stateName, st.abbreviation as stateAbbrev,
      c.name as countyName,
      (SELECT COUNT(*) FROM rr_talkgroups WHERE system_id = s.id) as talkgroupCount,
      (SELECT COUNT(*) FROM rr_sites WHERE system_id = s.id) as siteCount,
      u.priority, u.enabled
    FROM user_selected_systems u
    JOIN rr_systems s ON u.system_id = s.id
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    WHERE u.enabled = 1
    ORDER BY u.priority DESC, s.name
  `).all() as SystemSearchResult[];
}

// Sync progress tracking
export function updateSyncProgress(
  entityType: string,
  entityId: number | null,
  status: string,
  errorMessage?: string
): void {
  if (status === 'in_progress') {
    db.prepare(`
      INSERT INTO rr_sync_progress (entity_type, entity_id, status, started_at)
      VALUES (?, ?, ?, unixepoch())
    `).run(entityType, entityId, status);
  } else {
    db.prepare(`
      UPDATE rr_sync_progress
      SET status = ?, error_message = ?, completed_at = unixepoch()
      WHERE entity_type = ? AND entity_id = ? AND status = 'in_progress'
    `).run(status, errorMessage ?? null, entityType, entityId);
  }
}

export function clearSyncProgress(): void {
  db.prepare('DELETE FROM rr_sync_progress').run();
}

// Statistics
export function getSystemStats(): { totalSystems: number; totalTalkgroups: number; totalSites: number; p25Systems: number } {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM rr_systems) as totalSystems,
      (SELECT COUNT(*) FROM rr_talkgroups) as totalTalkgroups,
      (SELECT COUNT(*) FROM rr_sites) as totalSites,
      (SELECT COUNT(*) FROM rr_systems WHERE type LIKE '%P25%') as p25Systems
  `).get() as { totalSystems: number; totalTalkgroups: number; totalSites: number; p25Systems: number };
  return stats;
}

// Get system counts grouped by state and county
export function getSystemCountsByGeography(): {
  byState: Record<number, number>;
  byCounty: Record<number, number>;
} {
  // Count systems by state
  const stateRows = db.prepare(`
    SELECT state_id, COUNT(*) as count
    FROM rr_systems
    WHERE state_id IS NOT NULL
    GROUP BY state_id
  `).all() as { state_id: number; count: number }[];

  const byState: Record<number, number> = {};
  for (const row of stateRows) {
    byState[row.state_id] = row.count;
  }

  // Count systems by county
  const countyRows = db.prepare(`
    SELECT county_id, COUNT(*) as count
    FROM rr_systems
    WHERE county_id IS NOT NULL
    GROUP BY county_id
  `).all() as { county_id: number; count: number }[];

  const byCounty: Record<number, number> = {};
  for (const row of countyRows) {
    byCounty[row.county_id] = row.count;
  }

  return { byState, byCounty };
}

// Get control channels for systems in a county (for scanning)
export interface ControlChannelScanResult {
  frequency: number;
  systemId: number;
  systemName: string;
  systemType: string;
  siteName: string;
  isPrimary: boolean;
  nac?: string;
  wacn?: string;
}

export function getControlChannelsForCounty(countyId: number): ControlChannelScanResult[] {
  // Get control channels from systems in this county, or sites in this county
  return db.prepare(`
    SELECT DISTINCT
      f.frequency,
      s.id as systemId,
      s.name as systemName,
      s.type as systemType,
      si.name as siteName,
      f.is_primary as isPrimary,
      s.nac,
      s.wacn
    FROM rr_frequencies f
    JOIN rr_sites si ON f.site_id = si.id
    JOIN rr_systems s ON f.system_id = s.id
    WHERE f.channel_type = 'control'
      AND (s.county_id = ? OR si.county_id = ?)
    ORDER BY f.frequency
  `).all(countyId, countyId) as ControlChannelScanResult[];
}

// Get control channels for systems in a state (for broader scanning)
export function getControlChannelsForState(stateId: number): ControlChannelScanResult[] {
  return db.prepare(`
    SELECT DISTINCT
      f.frequency,
      s.id as systemId,
      s.name as systemName,
      s.type as systemType,
      si.name as siteName,
      f.is_primary as isPrimary,
      s.nac,
      s.wacn
    FROM rr_frequencies f
    JOIN rr_sites si ON f.site_id = si.id
    JOIN rr_systems s ON f.system_id = s.id
    WHERE f.channel_type = 'control'
      AND s.state_id = ?
    ORDER BY f.frequency
  `).all(stateId) as ControlChannelScanResult[];
}

// Rebuild search index
export function rebuildSearchIndex(): void {
  // Drop and recreate the contentless FTS5 table (can't DELETE from contentless tables)
  db.exec('DROP TABLE IF EXISTS rr_search');
  db.exec(`
    CREATE VIRTUAL TABLE rr_search USING fts5(
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
    )
  `);

  // Rebuild from systems and talkgroups
  db.exec(`
    INSERT INTO rr_search (rowid, system_name, system_type, talkgroup_alpha_tag, talkgroup_description, category, tag, state_name, state_abbrev, county_name, city)
    SELECT
      t.rowid,
      s.name,
      s.type,
      t.alpha_tag,
      t.description,
      t.category,
      t.tag,
      st.name,
      st.abbreviation,
      c.name,
      s.city
    FROM rr_talkgroups t
    JOIN rr_systems s ON t.system_id = s.id
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
  `);
}
