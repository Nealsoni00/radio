#!/usr/bin/env npx tsx
/**
 * RadioReference Sync Script for Postgres
 *
 * This script scrapes P25 systems from RadioReference and stores them in Postgres.
 * Run it locally with the POSTGRES_URL environment variable set to your connection string.
 *
 * Usage:
 *   POSTGRES_URL="postgres://..." npx tsx api/scripts/sync-radioreference.ts
 *   POSTGRES_URL="postgres://..." npx tsx api/scripts/sync-radioreference.ts --resume
 */

import 'dotenv/config';
import * as cheerio from 'cheerio';
import pg from 'pg';

const { Pool } = pg;

const BASE_URL = 'https://www.radioreference.com';
const DELAY_MS = parseInt(process.env.DELAY_MS || '500', 10);
const RESUME = process.argv.includes('--resume');

// Create database connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

interface CookieJar {
  cookies: Map<string, string>;
  get(): string;
  set(setCookieHeader: string | string[] | null): void;
}

function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();
  return {
    cookies,
    get(): string {
      return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    },
    set(setCookieHeader: string | string[] | null): void {
      if (!setCookieHeader) return;
      const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const header of headers) {
        const match = header.match(/^([^=]+)=([^;]*)/);
        if (match) {
          cookies.set(match[1], match[2]);
        }
      }
    },
  };
}

const cookieJar = createCookieJar();

async function delay(ms: number = DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    Cookie: cookieJar.get(),
  };

  const response = await fetch(url, { headers });
  cookieJar.set(response.headers.get('set-cookie'));
  return response.text();
}

interface State {
  id: number;
  name: string;
  abbreviation: string;
}

interface County {
  id: number;
  stateId: number;
  name: string;
}

interface System {
  id: number;
  name: string;
  type: string;
  flavor?: string;
  voice?: string;
  systemId?: string;
  wacn?: string;
  nac?: string;
  stateId: number;
  countyId?: number;
  city?: string;
  description?: string;
}

interface Site {
  id: number;
  systemId: number;
  name: string;
  rfss?: number;
  siteId?: number;
}

interface Talkgroup {
  systemId: number;
  talkgroupId: number;
  alphaTag?: string;
  description?: string;
  mode?: string;
  category?: string;
  tag?: string;
}

async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  console.log('Initializing database schema...');

  // System configuration
  await query(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
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

  // RadioReference Systems
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

  // Sync Progress
  await query(`
    CREATE TABLE IF NOT EXISTS rr_sync_progress (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Create indexes (ignore errors if they exist)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_rr_states_abbrev ON rr_states(abbreviation)',
    'CREATE INDEX IF NOT EXISTS idx_rr_counties_state ON rr_counties(state_id)',
    'CREATE INDEX IF NOT EXISTS idx_rr_systems_state ON rr_systems(state_id)',
    'CREATE INDEX IF NOT EXISTS idx_rr_systems_county ON rr_systems(county_id)',
    'CREATE INDEX IF NOT EXISTS idx_rr_systems_type ON rr_systems(type)',
    'CREATE INDEX IF NOT EXISTS idx_rr_sites_system ON rr_sites(system_id)',
    'CREATE INDEX IF NOT EXISTS idx_rr_frequencies_system ON rr_frequencies(system_id)',
    'CREATE INDEX IF NOT EXISTS idx_rr_talkgroups_system ON rr_talkgroups(system_id)',
  ];

  for (const idx of indexes) {
    try {
      await query(idx);
    } catch (e) {
      // Ignore index creation errors
    }
  }

  console.log('Database schema initialized');
}

async function getCompletedSystemIds(): Promise<Set<number>> {
  const result = await query(`
    SELECT entity_id FROM rr_sync_progress
    WHERE entity_type = 'system' AND status = 'completed'
  `);
  return new Set(result.rows.map((r: any) => r.entity_id));
}

async function markSystemCompleted(systemId: number) {
  await query(`
    INSERT INTO rr_sync_progress (entity_type, entity_id, status)
    VALUES ('system', $1, 'completed')
    ON CONFLICT DO NOTHING
  `, [systemId]);
}

// State abbreviation mapping
const STATE_ABBREVS: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'District of Columbia': 'DC',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL',
  'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA',
  'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR',
  'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA',
  'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'Puerto Rico': 'PR', 'Guam': 'GU', 'Virgin Islands': 'VI', 'American Samoa': 'AS',
  'Northern Mariana Islands': 'MP',
};

async function scrapeStates(): Promise<State[]> {
  console.log('Scraping states...');
  const html = await fetchPage(`${BASE_URL}/db/browse/`);
  const $ = cheerio.load(html);
  const states: State[] = [];

  // The select element has id="stidSelectorValue"
  $('select#stidSelectorValue option').each((_, el) => {
    const id = parseInt($(el).attr('value') || '0', 10);
    const name = $(el).text().trim();
    if (id > 0 && name) {
      const abbrev = STATE_ABBREVS[name] || name.substring(0, 2).toUpperCase();
      states.push({ id, name, abbreviation: abbrev });
    }
  });

  return states;
}

async function scrapeCounties(stateId: number): Promise<County[]> {
  const html = await fetchPage(`${BASE_URL}/db/browse/stid/${stateId}`);
  const $ = cheerio.load(html);
  const counties: County[] = [];

  // Counties are in a select element with id="ctidSelectorValue"
  $('select#ctidSelectorValue option').each((_, el) => {
    const id = parseInt($(el).attr('value') || '0', 10);
    const name = $(el).text().trim();
    if (id > 0 && name) {
      counties.push({ id, stateId, name });
    }
  });

  return counties;
}

async function scrapeSystemsFromCounty(stateId: number, countyId: number): Promise<System[]> {
  const html = await fetchPage(`${BASE_URL}/db/browse/ctid/${countyId}`);
  const $ = cheerio.load(html);
  const systems: System[] = [];
  const seenIds = new Set<number>();

  $('a[href*="/db/sid/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/sid\/(\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      // Skip if we've already seen this system (can appear multiple times on page)
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const name = $(el).text().trim();
      // Type is in the <small> tag in the same cell as the link
      const cell = $(el).closest('td');
      const typeText = cell.find('small').text().trim();

      const typeLower = typeText.toLowerCase();
      if (id > 0 && name && (typeLower.includes('p25') || typeLower.includes('project 25'))) {
        systems.push({
          id,
          name,
          type: typeText,
          stateId,
          countyId,
        });
      }
    }
  });

  return systems;
}

async function scrapeSystemDetails(systemId: number): Promise<{
  system: Partial<System>;
  sites: Site[];
  talkgroups: Talkgroup[];
}> {
  const html = await fetchPage(`${BASE_URL}/db/sid/${systemId}`);
  const $ = cheerio.load(html);

  const system: Partial<System> = {};
  const sites: Site[] = [];
  const talkgroups: Talkgroup[] = [];

  // System details are in table rows with th.rrlblue labels
  $('table tr').each((_, row) => {
    const label = $(row).find('th.rrlblue').first().text().trim().toLowerCase();
    const value = $(row).find('td').first().text().trim();

    if (label.includes('system type')) system.type = value;
    if (label.includes('system voice')) system.voice = value;
    if (label.includes('system flavor')) system.flavor = value;
    if (label.includes('system id')) {
      // Format: "Sysid: 69F WACN: BEE00" or similar
      const sysidMatch = value.match(/Sysid:\s*([A-Fa-f0-9]+)/i);
      const wacnMatch = value.match(/WACN:\s*([A-Fa-f0-9]+)/i);
      const nacMatch = value.match(/NAC:\s*([A-Fa-f0-9]+)/i);
      if (sysidMatch) system.systemId = sysidMatch[1];
      if (wacnMatch) system.wacn = wacnMatch[1];
      if (nacMatch) system.nac = nacMatch[1];
    }
  });

  $('a[href*="/db/site/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/site\/(\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      const name = $(el).text().trim();
      if (id > 0 && name) {
        sites.push({ id, systemId, name });
      }
    }
  });

  const tgHtml = await fetchPage(`${BASE_URL}/db/sid/${systemId}/tgid`);
  const $tg = cheerio.load(tgHtml);

  // Table columns: DEC (index 0), HEX (1), Mode (2), Alpha Tag (3), Description (4), Tag (5)
  $tg('table.rrdbTable tbody tr').each((_, row) => {
    const cells = $tg(row).find('td');
    if (cells.length >= 5) {
      const tgId = parseInt(cells.eq(0).text().trim(), 10);
      const mode = cells.eq(2).text().trim();
      const alphaTag = cells.eq(3).text().trim();
      const description = cells.eq(4).text().trim();
      const tag = cells.length >= 6 ? cells.eq(5).text().trim() : undefined;

      if (tgId > 0) {
        talkgroups.push({
          systemId,
          talkgroupId: tgId,
          alphaTag: alphaTag || undefined,
          description: description || undefined,
          mode: mode || undefined,
          tag: tag || undefined,
        });
      }
    }
  });

  return { system, sites, talkgroups };
}

async function upsertState(state: State) {
  await query(`
    INSERT INTO rr_states (id, name, abbreviation, last_synced, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      abbreviation = EXCLUDED.abbreviation,
      last_synced = NOW(),
      updated_at = NOW()
  `, [state.id, state.name, state.abbreviation]);
}

async function upsertCounty(county: County) {
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

async function upsertSystem(system: System) {
  await query(`
    INSERT INTO rr_systems (
      id, name, type, flavor, voice, system_id, wacn, nac,
      state_id, county_id, city, description, last_synced, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      flavor = EXCLUDED.flavor,
      voice = EXCLUDED.voice,
      system_id = EXCLUDED.system_id,
      wacn = EXCLUDED.wacn,
      nac = EXCLUDED.nac,
      state_id = EXCLUDED.state_id,
      county_id = EXCLUDED.county_id,
      last_synced = NOW(),
      updated_at = NOW()
  `, [
    system.id, system.name, system.type, system.flavor ?? null,
    system.voice ?? null, system.systemId ?? null, system.wacn ?? null,
    system.nac ?? null, system.stateId, system.countyId ?? null,
    system.city ?? null, system.description ?? null
  ]);
}

async function upsertSite(site: Site) {
  await query(`
    INSERT INTO rr_sites (id, system_id, name, rfss, site_id, last_synced, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      last_synced = NOW(),
      updated_at = NOW()
  `, [site.id, site.systemId, site.name, site.rfss ?? null, site.siteId ?? null]);
}

async function upsertTalkgroup(tg: Talkgroup) {
  await query(`
    INSERT INTO rr_talkgroups (
      system_id, talkgroup_id, alpha_tag, description, mode, category, tag, last_synced, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (system_id, talkgroup_id) DO UPDATE SET
      alpha_tag = EXCLUDED.alpha_tag,
      description = EXCLUDED.description,
      mode = EXCLUDED.mode,
      last_synced = NOW(),
      updated_at = NOW()
  `, [
    tg.systemId, tg.talkgroupId, tg.alphaTag ?? null, tg.description ?? null,
    tg.mode ?? null, tg.category ?? null, tg.tag ?? null
  ]);
}

async function getStats() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*) FROM rr_states) as states,
      (SELECT COUNT(*) FROM rr_counties) as counties,
      (SELECT COUNT(*) FROM rr_systems) as systems,
      (SELECT COUNT(*) FROM rr_talkgroups) as talkgroups,
      (SELECT COUNT(*) FROM rr_sites) as sites
  `);
  return result.rows[0];
}

async function main() {
  console.log('RadioReference Sync for Postgres');
  console.log('=================================');

  if (!process.env.POSTGRES_URL) {
    console.error('Error: POSTGRES_URL environment variable is required');
    process.exit(1);
  }

  await initializeDatabase();

  const completedSystems = RESUME ? await getCompletedSystemIds() : new Set<number>();
  if (RESUME) {
    console.log(`Resuming sync. ${completedSystems.size} systems already completed.`);
  }

  const states = await scrapeStates();
  console.log(`Found ${states.length} states`);

  for (const state of states) {
    await upsertState(state);
  }

  let totalSystems = 0;

  for (const state of states) {
    console.log(`\nProcessing ${state.name}...`);
    await delay();

    const counties = await scrapeCounties(state.id);
    console.log(`  Found ${counties.length} counties`);

    for (const county of counties) {
      await upsertCounty(county);
    }

    for (const county of counties) {
      await delay();

      const systems = await scrapeSystemsFromCounty(state.id, county.id);
      totalSystems += systems.length;

      for (const system of systems) {
        if (completedSystems.has(system.id)) {
          console.log(`  Skipping ${system.name} (already synced)`);
          continue;
        }

        console.log(`  Syncing ${system.name}...`);
        await upsertSystem(system);

        try {
          await delay();
          const details = await scrapeSystemDetails(system.id);

          if (details.system) {
            await upsertSystem({ ...system, ...details.system });
          }

          for (const site of details.sites) {
            await upsertSite(site);
          }

          for (const tg of details.talkgroups) {
            await upsertTalkgroup(tg);
          }

          await markSystemCompleted(system.id);
          completedSystems.add(system.id);  // Add to in-memory set to avoid re-processing in same run
          console.log(`    - ${details.sites.length} sites, ${details.talkgroups.length} talkgroups`);
        } catch (error) {
          console.error(`    Error processing system ${system.id}:`, error);
        }
      }
    }
  }

  const stats = await getStats();
  console.log('\n=================================');
  console.log('Sync Complete!');
  console.log(`States: ${stats.states}`);
  console.log(`Counties: ${stats.counties}`);
  console.log(`Systems: ${stats.systems}`);
  console.log(`Talkgroups: ${stats.talkgroups}`);
  console.log(`Sites: ${stats.sites}`);

  await pool.end();
}

main().catch(console.error);
