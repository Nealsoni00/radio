/**
 * RadioReference data fetched from Vercel Postgres (cloud database)
 *
 * This module connects to the production Postgres database for RadioReference data,
 * allowing the local dev server to use the same data as production without local sync.
 */

import pg from 'pg';
import type {
  RRState,
  RRCounty,
  RRSystem,
  RRSite,
  RRFrequency,
  RRTalkgroup,
} from '../services/radioreference/types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || '';
    if (!connectionString) {
      throw new Error('POSTGRES_URL environment variable not set');
    }

    // Remove sslmode from connection string and configure SSL separately
    const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');

    pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

// State operations
export function getStates(): Promise<RRState[]> {
  return getPool().query(`
    SELECT id, name, abbreviation, country_id as "countryId"
    FROM rr_states
    ORDER BY name
  `).then(r => r.rows);
}

export function getState(id: number): Promise<RRState | undefined> {
  return getPool().query(`
    SELECT id, name, abbreviation, country_id as "countryId"
    FROM rr_states WHERE id = $1
  `, [id]).then(r => r.rows[0]);
}

// County operations
export function getCounties(stateId?: number): Promise<RRCounty[]> {
  if (stateId) {
    return getPool().query(`
      SELECT id, state_id as "stateId", name
      FROM rr_counties WHERE state_id = $1
      ORDER BY name
    `, [stateId]).then(r => r.rows);
  }
  return getPool().query(`
    SELECT id, state_id as "stateId", name
    FROM rr_counties ORDER BY name
  `).then(r => r.rows);
}

export function getCounty(id: number): Promise<RRCounty | undefined> {
  return getPool().query(`
    SELECT id, state_id as "stateId", name
    FROM rr_counties WHERE id = $1
  `, [id]).then(r => r.rows[0]);
}

// System operations
export function getSystems(options: {
  stateId?: number;
  countyId?: number;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ systems: RRSystem[]; total: number }> {
  const { stateId, countyId, type, search, limit = 50, offset = 0 } = options;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (stateId) {
    whereClause += ` AND s.state_id = $${paramIndex++}`;
    params.push(stateId);
  }
  if (countyId) {
    whereClause += ` AND s.county_id = $${paramIndex++}`;
    params.push(countyId);
  }
  if (type) {
    // Handle P25 type filter - match both "P25" and "Project 25" variations
    if (type.toUpperCase() === 'P25') {
      whereClause += ` AND (s.type ILIKE $${paramIndex} OR s.type ILIKE $${paramIndex + 1})`;
      params.push('%P25%', '%Project 25%');
      paramIndex += 2;
    } else {
      whereClause += ` AND s.type ILIKE $${paramIndex++}`;
      params.push(`%${type}%`);
    }
  }
  if (search) {
    whereClause += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const query = `
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as "systemId",
      s.wacn, s.nac, s.rfss, s.state_id as "stateId", s.county_id as "countyId",
      s.city, s.description, s.is_active as "isActive",
      st.name as "stateName", st.abbreviation as "stateAbbrev",
      c.name as "countyName",
      (SELECT COUNT(*) FROM rr_talkgroups WHERE system_id = s.id) as "talkgroupCount",
      (SELECT COUNT(*) FROM rr_sites WHERE system_id = s.id) as "siteCount"
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    ${whereClause}
    ORDER BY s.name
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  params.push(limit, offset);

  const countQuery = `
    SELECT COUNT(*) as total
    FROM rr_systems s
    ${whereClause}
  `;

  return Promise.all([
    getPool().query(query, params),
    getPool().query(countQuery, params.slice(0, -2)),
  ]).then(([systemsResult, countResult]) => ({
    systems: systemsResult.rows,
    total: parseInt(countResult.rows[0].total),
  }));
}

export function getSystem(id: number): Promise<(RRSystem & { stateName?: string; stateAbbrev?: string; countyName?: string }) | undefined> {
  return getPool().query(`
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as "systemId",
      s.wacn, s.nac, s.rfss, s.state_id as "stateId", s.county_id as "countyId",
      s.city, s.description, s.is_active as "isActive",
      st.name as "stateName", st.abbreviation as "stateAbbrev",
      c.name as "countyName"
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    WHERE s.id = $1
  `, [id]).then(r => r.rows[0]);
}

// Site operations
export function getSites(systemId: number): Promise<RRSite[]> {
  return getPool().query(`
    SELECT
      id, system_id as "systemId", name, description, rfss,
      site_id as "siteId", county_id as "countyId",
      latitude, longitude, range_miles as "rangeMiles"
    FROM rr_sites
    WHERE system_id = $1
    ORDER BY name
  `, [systemId]).then(r => r.rows);
}

// Frequency operations
export function getFrequencies(systemId: number): Promise<RRFrequency[]> {
  return getPool().query(`
    SELECT
      f.id, f.site_id as "siteId", f.system_id as "systemId",
      f.frequency, f.channel_type as "channelType", f.lcn,
      f.is_primary as "isPrimary",
      s.name as "siteName"
    FROM rr_frequencies f
    LEFT JOIN rr_sites s ON f.site_id = s.id
    WHERE f.system_id = $1
    ORDER BY f.frequency
  `, [systemId]).then(r => r.rows);
}

// Talkgroup operations
export function getTalkgroups(options: {
  systemId: number;
  limit?: number;
  offset?: number;
}): Promise<{ talkgroups: RRTalkgroup[]; total: number }> {
  const { systemId, limit = 1000, offset = 0 } = options;

  return Promise.all([
    getPool().query(`
      SELECT
        id, system_id as "systemId", talkgroup_id as "talkgroupId",
        alpha_tag as "alphaTag", description, mode, category, tag
      FROM rr_talkgroups
      WHERE system_id = $1
      ORDER BY talkgroup_id
      LIMIT $2 OFFSET $3
    `, [systemId, limit, offset]),
    getPool().query(`
      SELECT COUNT(*) as total
      FROM rr_talkgroups
      WHERE system_id = $1
    `, [systemId]),
  ]).then(([talkgroupsResult, countResult]) => ({
    talkgroups: talkgroupsResult.rows,
    total: parseInt(countResult.rows[0].total),
  }));
}

// Search operations
export function searchSystems(query: string, limit = 20): Promise<RRSystem[]> {
  return getPool().query(`
    SELECT
      s.id, s.name, s.type, s.flavor, s.voice, s.system_id as "systemId",
      s.state_id as "stateId", s.county_id as "countyId",
      s.city, s.description, s.is_active as "isActive",
      st.name as "stateName", st.abbreviation as "stateAbbrev",
      c.name as "countyName"
    FROM rr_systems s
    LEFT JOIN rr_states st ON s.state_id = st.id
    LEFT JOIN rr_counties c ON s.county_id = c.id
    WHERE s.name ILIKE $1 OR s.description ILIKE $1
    ORDER BY s.name
    LIMIT $2
  `, [`%${query}%`, limit]).then(r => r.rows);
}

export function searchTalkgroups(query: string, systemId?: number, limit = 20): Promise<RRTalkgroup[]> {
  if (systemId) {
    return getPool().query(`
      SELECT
        id, system_id as "systemId", talkgroup_id as "talkgroupId",
        alpha_tag as "alphaTag", description, mode, category, tag
      FROM rr_talkgroups
      WHERE system_id = $1 AND (alpha_tag ILIKE $2 OR description ILIKE $2)
      ORDER BY talkgroup_id
      LIMIT $3
    `, [systemId, `%${query}%`, limit]).then(r => r.rows);
  }
  return getPool().query(`
    SELECT
      id, system_id as "systemId", talkgroup_id as "talkgroupId",
      alpha_tag as "alphaTag", description, mode, category, tag
    FROM rr_talkgroups
    WHERE alpha_tag ILIKE $1 OR description ILIKE $1
    ORDER BY talkgroup_id
    LIMIT $2
  `, [`%${query}%`, limit]).then(r => r.rows);
}

// Stats operations
export function getSystemStats(): Promise<{
  totalSystems: number;
  totalTalkgroups: number;
  totalSites: number;
  p25Systems: number;
}> {
  return Promise.all([
    getPool().query('SELECT COUNT(*) as count FROM rr_systems'),
    getPool().query('SELECT COUNT(*) as count FROM rr_talkgroups'),
    getPool().query('SELECT COUNT(*) as count FROM rr_sites'),
    getPool().query("SELECT COUNT(*) as count FROM rr_systems WHERE type ILIKE '%P25%'"),
  ]).then(([systems, talkgroups, sites, p25]) => ({
    totalSystems: parseInt(systems.rows[0].count),
    totalTalkgroups: parseInt(talkgroups.rows[0].count),
    totalSites: parseInt(sites.rows[0].count),
    p25Systems: parseInt(p25.rows[0].count),
  }));
}

export function getSystemCountsByGeography(): Promise<{
  byState: Record<number, number>;
  byCounty: Record<number, number>;
}> {
  return Promise.all([
    getPool().query(`
      SELECT state_id, COUNT(*) as count
      FROM rr_systems
      WHERE state_id IS NOT NULL
      GROUP BY state_id
    `),
    getPool().query(`
      SELECT county_id, COUNT(*) as count
      FROM rr_systems
      WHERE county_id IS NOT NULL
      GROUP BY county_id
    `),
  ]).then(([stateResult, countyResult]) => {
    const byState: Record<number, number> = {};
    for (const row of stateResult.rows) {
      byState[row.state_id] = parseInt(row.count);
    }

    const byCounty: Record<number, number> = {};
    for (const row of countyResult.rows) {
      byCounty[row.county_id] = parseInt(row.count);
    }

    return { byState, byCounty };
  });
}

// Selected systems (stored locally in SQLite, not in Postgres)
// These functions will need to use the local db
import { db } from './index.js';

export function getSelectedSystems(): number[] {
  try {
    const rows = db.prepare('SELECT system_id FROM rr_selected_systems').all() as { system_id: number }[];
    return rows.map(r => r.system_id);
  } catch {
    return [];
  }
}

export function addSelectedSystem(systemId: number): void {
  try {
    db.prepare('INSERT OR IGNORE INTO rr_selected_systems (system_id) VALUES (?)').run(systemId);
  } catch {
    // Table might not exist
  }
}

export function removeSelectedSystem(systemId: number): void {
  try {
    db.prepare('DELETE FROM rr_selected_systems WHERE system_id = ?').run(systemId);
  } catch {
    // Table might not exist
  }
}

// Control channel helpers for scanning
export async function getControlChannelsForCounty(countyId: number): Promise<{ systemId: number; frequency: number }[]> {
  const result = await getPool().query(`
    SELECT DISTINCT s.id as "systemId", f.frequency
    FROM rr_systems s
    JOIN rr_frequencies f ON f.system_id = s.id
    WHERE s.county_id = $1 AND f.is_primary = true
    ORDER BY f.frequency
  `, [countyId]);
  return result.rows;
}

export async function getControlChannelsForState(stateId: number): Promise<{ systemId: number; frequency: number }[]> {
  const result = await getPool().query(`
    SELECT DISTINCT s.id as "systemId", f.frequency
    FROM rr_systems s
    JOIN rr_frequencies f ON f.system_id = s.id
    WHERE s.state_id = $1 AND f.is_primary = true
    ORDER BY f.frequency
  `, [stateId]);
  return result.rows;
}

export async function getSystemsForCountyScan(countyId: number): Promise<RRSystem[]> {
  const result = await getPool().query(`
    SELECT
      s.id, s.name, s.type, s.system_id as "systemId",
      s.wacn, s.nac
    FROM rr_systems s
    WHERE s.county_id = $1
    ORDER BY s.name
  `, [countyId]);
  return result.rows;
}

export async function getSystemsForStateScan(stateId: number): Promise<RRSystem[]> {
  const result = await getPool().query(`
    SELECT
      s.id, s.name, s.type, s.system_id as "systemId",
      s.wacn, s.nac
    FROM rr_systems s
    WHERE s.state_id = $1
    ORDER BY s.name
  `, [stateId]);
  return result.rows;
}
