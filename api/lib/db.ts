import pg from 'pg';

const { Client } = pg;

// For serverless functions, use a single client per request instead of a pool
async function getClient(): Promise<pg.Client> {
  const connectionString = process.env.POSTGRES_URL || '';
  // Remove sslmode from connection string for compatibility
  const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');

  const client = new Client({
    connectionString: cleanConnectionString,
    ssl: false,
  });
  await client.connect();
  return client;
}

async function query(text: string, params?: any[]) {
  const client = await getClient();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

// Initialize database schema
export async function initializeDatabase() {
  // System configuration
  await query(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Insert defaults
  await query(`
    INSERT INTO system_config (key, value)
    VALUES ('system_type', 'p25')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO system_config (key, value)
    VALUES ('system_short_name', 'default')
    ON CONFLICT (key) DO NOTHING
  `);

  // RadioReference States
  await query(`
    CREATE TABLE IF NOT EXISTS rr_states (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      country_id INTEGER DEFAULT 1,
      last_synced TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_states_abbrev ON rr_states(abbreviation)`);

  // RadioReference Counties
  await query(`
    CREATE TABLE IF NOT EXISTS rr_counties (
      id INTEGER PRIMARY KEY,
      state_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      last_synced TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_counties_state ON rr_counties(state_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_counties_name ON rr_counties(name)`);

  // RadioReference P25 Trunked Systems
  await query(`
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
      last_synced TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_systems_state ON rr_systems(state_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_systems_county ON rr_systems(county_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_systems_type ON rr_systems(type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_systems_name ON rr_systems(name)`);

  // RadioReference Sites
  await query(`
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
      last_synced TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_sites_system ON rr_sites(system_id)`);

  // RadioReference Frequencies
  await query(`
    CREATE TABLE IF NOT EXISTS rr_frequencies (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL,
      system_id INTEGER NOT NULL,
      frequency INTEGER NOT NULL,
      channel_type TEXT NOT NULL DEFAULT 'voice',
      lcn INTEGER,
      is_primary BOOLEAN DEFAULT false,
      last_synced TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_frequencies_site ON rr_frequencies(site_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_frequencies_system ON rr_frequencies(system_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_frequencies_freq ON rr_frequencies(frequency)`);

  // RadioReference Talkgroups
  await query(`
    CREATE TABLE IF NOT EXISTS rr_talkgroups (
      id SERIAL PRIMARY KEY,
      system_id INTEGER NOT NULL,
      talkgroup_id INTEGER NOT NULL,
      alpha_tag TEXT,
      description TEXT,
      mode TEXT,
      category TEXT,
      tag TEXT,
      last_synced TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(system_id, talkgroup_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_system ON rr_talkgroups(system_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_tgid ON rr_talkgroups(talkgroup_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_tag ON rr_talkgroups(tag)`);

  // Sync Progress
  await query(`
    CREATE TABLE IF NOT EXISTS rr_sync_progress (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      parent_id INTEGER,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_rr_sync_status ON rr_sync_progress(entity_type, status)`);

  // User Selected Systems
  await query(`
    CREATE TABLE IF NOT EXISTS user_selected_systems (
      id SERIAL PRIMARY KEY,
      system_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(system_id)
    )
  `);

  console.log('Database schema initialized');
}

// Query helpers
export async function getStats() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*) FROM rr_systems) as total_systems,
      (SELECT COUNT(*) FROM rr_talkgroups) as total_talkgroups,
      (SELECT COUNT(*) FROM rr_sites) as total_sites,
      (SELECT COUNT(*) FROM rr_systems WHERE type ILIKE '%P25%') as p25_systems
  `);
  return result.rows[0];
}

export async function getStates() {
  const result = await query(`
    SELECT id, name, abbreviation, country_id as "countryId"
    FROM rr_states
    ORDER BY name
  `);
  return result.rows;
}

export async function getCounties(stateId?: number) {
  if (stateId) {
    const result = await query(`
      SELECT id, state_id as "stateId", name
      FROM rr_counties
      WHERE state_id = $1
      ORDER BY name
    `, [stateId]);
    return result.rows;
  }
  const result = await query(`
    SELECT id, state_id as "stateId", name
    FROM rr_counties
    ORDER BY name
  `);
  return result.rows;
}

export async function getSystems(options: {
  state?: number;
  county?: number;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { state, county, type, search, limit = 50, offset = 0 } = options;

  let queryStr = `
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
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (state) {
    queryStr += ` AND s.state_id = $${paramIndex++}`;
    params.push(state);
  }
  if (county) {
    queryStr += ` AND s.county_id = $${paramIndex++}`;
    params.push(county);
  }
  if (type) {
    queryStr += ` AND s.type ILIKE $${paramIndex++}`;
    params.push(`%${type}%`);
  }
  if (search) {
    queryStr += ` AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  queryStr += ` ORDER BY s.name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  // Count query
  let countQueryStr = `
    SELECT COUNT(*) as total
    FROM rr_systems s
    WHERE 1=1
  `;
  const countParams: any[] = [];
  let countParamIndex = 1;

  if (state) {
    countQueryStr += ` AND s.state_id = $${countParamIndex++}`;
    countParams.push(state);
  }
  if (county) {
    countQueryStr += ` AND s.county_id = $${countParamIndex++}`;
    countParams.push(county);
  }
  if (type) {
    countQueryStr += ` AND s.type ILIKE $${countParamIndex++}`;
    countParams.push(`%${type}%`);
  }
  if (search) {
    countQueryStr += ` AND (s.name ILIKE $${countParamIndex} OR s.description ILIKE $${countParamIndex})`;
    countParams.push(`%${search}%`);
  }

  const { rows } = await query(queryStr, params);
  const countResult = await query(countQueryStr, countParams);

  return {
    systems: rows,
    total: parseInt(countResult.rows[0].total),
  };
}

export async function getSystem(id: number) {
  const result = await query(`
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
  `, [id]);
  return result.rows[0];
}

export async function getSites(systemId: number) {
  const result = await query(`
    SELECT
      id, system_id as "systemId", name, description, rfss,
      site_id as "siteId", county_id as "countyId",
      latitude, longitude, range_miles as "rangeMiles"
    FROM rr_sites
    WHERE system_id = $1
    ORDER BY name
  `, [systemId]);
  return result.rows;
}

export async function getFrequencies(systemId: number) {
  const result = await query(`
    SELECT
      f.id, f.site_id as "siteId", f.system_id as "systemId",
      f.frequency, f.channel_type as "channelType", f.lcn,
      f.is_primary as "isPrimary",
      s.name as "siteName"
    FROM rr_frequencies f
    LEFT JOIN rr_sites s ON f.site_id = s.id
    WHERE f.system_id = $1
    ORDER BY f.frequency
  `, [systemId]);
  return result.rows;
}

export async function getTalkgroups(systemId: number, options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 1000;
  const offset = options?.offset ?? 0;

  const result = await query(`
    SELECT
      id, system_id as "systemId", talkgroup_id as "talkgroupId",
      alpha_tag as "alphaTag", description, mode, category, tag
    FROM rr_talkgroups
    WHERE system_id = $1
    ORDER BY talkgroup_id
    LIMIT $2 OFFSET $3
  `, [systemId, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total
    FROM rr_talkgroups
    WHERE system_id = $1
  `, [systemId]);

  return {
    talkgroups: result.rows,
    total: parseInt(countResult.rows[0].total),
  };
}

export async function getGeographyCounts() {
  const stateResult = await query(`
    SELECT state_id, COUNT(*) as count
    FROM rr_systems
    WHERE state_id IS NOT NULL
    GROUP BY state_id
  `);

  const countyResult = await query(`
    SELECT county_id, COUNT(*) as count
    FROM rr_systems
    WHERE county_id IS NOT NULL
    GROUP BY county_id
  `);

  const byState: Record<number, number> = {};
  const byCounty: Record<number, number> = {};

  for (const row of stateResult.rows) {
    byState[row.state_id] = parseInt(row.count);
  }
  for (const row of countyResult.rows) {
    byCounty[row.county_id] = parseInt(row.count);
  }

  return { byState, byCounty };
}

// Upsert functions for sync
export async function upsertState(state: {
  id: number;
  name: string;
  abbreviation: string;
  countryId: number;
}) {
  await query(`
    INSERT INTO rr_states (id, name, abbreviation, country_id, last_synced, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      abbreviation = EXCLUDED.abbreviation,
      last_synced = NOW(),
      updated_at = NOW()
  `, [state.id, state.name, state.abbreviation, state.countryId]);
}

export async function upsertCounty(county: {
  id: number;
  stateId: number;
  name: string;
}) {
  await query(`
    INSERT INTO rr_counties (id, state_id, name, last_synced, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      state_id = EXCLUDED.state_id,
      name = EXCLUDED.name,
      last_synced = NOW(),
      updated_at = NOW()
  `, [county.id, county.stateId, county.name]);
}

export async function upsertSystem(system: {
  id: number;
  name: string;
  type: string;
  flavor?: string;
  voice?: string;
  systemId?: string;
  wacn?: string;
  nac?: string;
  rfss?: number;
  stateId: number;
  countyId?: number;
  city?: string;
  description?: string;
  isActive: boolean;
}) {
  await query(`
    INSERT INTO rr_systems (
      id, name, type, flavor, voice, system_id, wacn, nac, rfss,
      state_id, county_id, city, description, is_active, last_synced, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      flavor = EXCLUDED.flavor,
      voice = EXCLUDED.voice,
      system_id = EXCLUDED.system_id,
      wacn = EXCLUDED.wacn,
      nac = EXCLUDED.nac,
      rfss = EXCLUDED.rfss,
      state_id = EXCLUDED.state_id,
      county_id = EXCLUDED.county_id,
      city = EXCLUDED.city,
      description = EXCLUDED.description,
      is_active = EXCLUDED.is_active,
      last_synced = NOW(),
      updated_at = NOW()
  `, [
    system.id, system.name, system.type, system.flavor ?? null,
    system.voice ?? null, system.systemId ?? null, system.wacn ?? null,
    system.nac ?? null, system.rfss ?? null, system.stateId,
    system.countyId ?? null, system.city ?? null, system.description ?? null,
    system.isActive
  ]);
}

export async function upsertSite(site: {
  id: number;
  systemId: number;
  name: string;
  description?: string;
  rfss?: number;
  siteId?: number;
  countyId?: number;
  latitude?: number;
  longitude?: number;
  rangeMiles?: number;
}) {
  await query(`
    INSERT INTO rr_sites (
      id, system_id, name, description, rfss, site_id, county_id,
      latitude, longitude, range_miles, last_synced, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      system_id = EXCLUDED.system_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      rfss = EXCLUDED.rfss,
      site_id = EXCLUDED.site_id,
      county_id = EXCLUDED.county_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      range_miles = EXCLUDED.range_miles,
      last_synced = NOW(),
      updated_at = NOW()
  `, [
    site.id, site.systemId, site.name, site.description ?? null,
    site.rfss ?? null, site.siteId ?? null, site.countyId ?? null,
    site.latitude ?? null, site.longitude ?? null, site.rangeMiles ?? null
  ]);
}

export async function insertFrequency(freq: {
  siteId: number;
  systemId: number;
  frequency: number;
  channelType: string;
  lcn?: number;
  isPrimary: boolean;
}) {
  await query(`
    INSERT INTO rr_frequencies (site_id, system_id, frequency, channel_type, lcn, is_primary, last_synced)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [freq.siteId, freq.systemId, freq.frequency, freq.channelType, freq.lcn ?? null, freq.isPrimary]);
}

export async function deleteFrequenciesForSystem(systemId: number) {
  await query(`DELETE FROM rr_frequencies WHERE system_id = $1`, [systemId]);
}

export async function upsertTalkgroup(tg: {
  systemId: number;
  talkgroupId: number;
  alphaTag?: string;
  description?: string;
  mode?: string;
  category?: string;
  tag?: string;
}) {
  await query(`
    INSERT INTO rr_talkgroups (
      system_id, talkgroup_id, alpha_tag, description, mode, category, tag, last_synced, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
    )
    ON CONFLICT (system_id, talkgroup_id) DO UPDATE SET
      alpha_tag = EXCLUDED.alpha_tag,
      description = EXCLUDED.description,
      mode = EXCLUDED.mode,
      category = EXCLUDED.category,
      tag = EXCLUDED.tag,
      last_synced = NOW(),
      updated_at = NOW()
  `, [tg.systemId, tg.talkgroupId, tg.alphaTag ?? null, tg.description ?? null, tg.mode ?? null, tg.category ?? null, tg.tag ?? null]);
}
