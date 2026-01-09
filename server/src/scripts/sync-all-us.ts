#!/usr/bin/env tsx
/**
 * Comprehensive US P25 Network Scraper
 *
 * This script scrapes ALL P25 trunked systems from RadioReference for the entire United States.
 * It goes through every state, every county, and fetches full details for each P25 system.
 *
 * Usage:
 *   npm run sync:all                    # Sync all states
 *   npm run sync:all -- --resume        # Resume from where it left off
 *   npm run sync:all -- --delay-ms 1000 # Adjust rate limiting
 *   npm run sync:all -- --skip-details  # Only sync systems, skip talkgroup details
 */

import 'dotenv/config';
import { parseArgs } from 'util';
import { initializeDatabase, db } from '../db/index.js';
import {
  upsertState,
  upsertCounty,
  upsertSystem,
  upsertSite,
  insertFrequencies,
  insertTalkgroups,
  getSystemStats,
  rebuildSearchIndex,
  getSystem,
} from '../db/radioreference.js';
import { RadioReferenceScraper } from '../services/radioreference/scraper.js';
import type { RRSystem, RRCounty } from '../services/radioreference/types.js';

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    resume: { type: 'boolean', default: false },
    'skip-details': { type: 'boolean', default: false },
    'delay-ms': { type: 'string', default: '500' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help) {
  console.log(`
Comprehensive US P25 Network Scraper

This script scrapes ALL P25 systems from RadioReference for the entire United States.

Usage:
  npm run sync:all                    Sync all states, counties, and P25 systems
  npm run sync:all -- --resume        Resume from the last saved progress
  npm run sync:all -- --skip-details  Only sync system list, skip detailed talkgroups
  npm run sync:all -- --delay-ms 1000 Adjust delay between requests (default: 500)

The script is designed to be run multiple times - it's idempotent and can resume.
Progress is saved to the database so you can stop and continue later.

Environment Variables:
  RR_USERNAME    RadioReference username (optional, for premium data)
  RR_PASSWORD    RadioReference password
  `);
  process.exit(0);
}

const delayMs = parseInt(args['delay-ms'] || '500', 10);
const scraper = new RadioReferenceScraper(delayMs);

// Progress tracking
interface SyncProgress {
  currentPhase: 'states' | 'counties' | 'systems' | 'details';
  currentStateId: number | null;
  currentCountyId: number | null;
  completedStates: number[];
  completedCounties: number[];
  completedSystems: number[];
  totalStates: number;
  totalCounties: number;
  totalSystems: number;
  errors: { entity: string; id: number; error: string }[];
}

function loadProgress(): SyncProgress {
  try {
    const row = db.prepare(`
      SELECT error_message FROM rr_sync_progress
      WHERE entity_type = 'full_sync' AND entity_id = 0
      ORDER BY id DESC LIMIT 1
    `).get() as { error_message: string } | undefined;

    if (row && row.error_message) {
      return JSON.parse(row.error_message);
    }
  } catch (e) {
    // No progress saved
  }

  return {
    currentPhase: 'states',
    currentStateId: null,
    currentCountyId: null,
    completedStates: [],
    completedCounties: [],
    completedSystems: [],
    totalStates: 0,
    totalCounties: 0,
    totalSystems: 0,
    errors: [],
  };
}

function saveProgress(progress: SyncProgress): void {
  db.prepare(`
    INSERT INTO rr_sync_progress (entity_type, entity_id, status, error_message)
    VALUES ('full_sync', 0, 'in_progress', ?)
  `).run(JSON.stringify(progress));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

async function syncCountySystems(
  stateId: number,
  countyId: number,
  countyName: string,
  progress: SyncProgress,
  skipDetails: boolean
): Promise<number> {
  if (progress.completedCounties.includes(countyId)) {
    return 0;
  }

  try {
    // Get systems from this county page
    const response = await fetch(
      `https://www.radioreference.com/db/browse/ctid/${countyId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      }
    );
    const html = await response.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const systems: RRSystem[] = [];

    // Find P25 systems
    $('a[href*="/db/sid/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/db\/sid\/(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        const name = $(el).text().trim();

        // Get type from row
        let type = 'Unknown';
        const $row = $(el).closest('tr');
        if ($row.length) {
          const rowText = $row.text();
          const typeMatch = rowText.match(/(Project 25 Phase II|Project 25|P25 Phase II|P25)/i);
          if (typeMatch) {
            type = typeMatch[1];
          }
        }

        // Only include P25 systems
        if (type.includes('P25') || type.includes('Project 25')) {
          if (!systems.find((s) => s.id === id)) {
            systems.push({
              id,
              name,
              type: type.includes('Phase II') ? 'P25 Phase II' : 'P25',
              stateId,
              countyId,
              isActive: true,
            });
          }
        }
      }
    });

    // Save systems
    for (const system of systems) {
      try {
        upsertSystem(system);
        progress.totalSystems++;

        // Get full details if not skipping
        if (!skipDetails && !progress.completedSystems.includes(system.id)) {
          await syncSystemDetails(system.id, progress);
        }
      } catch (error) {
        progress.errors.push({
          entity: 'system',
          id: system.id,
          error: String(error),
        });
      }
    }

    progress.completedCounties.push(countyId);
    return systems.length;
  } catch (error) {
    progress.errors.push({
      entity: 'county',
      id: countyId,
      error: String(error),
    });
    return 0;
  }
}

async function syncSystemDetails(systemId: number, progress: SyncProgress): Promise<void> {
  if (progress.completedSystems.includes(systemId)) {
    return;
  }

  try {
    const existingSystem = getSystem(systemId);
    const { system, sites, frequencies, talkgroups } = await scraper.getSystemDetails(systemId);

    // Update system with details
    if (existingSystem) {
      upsertSystem({
        id: systemId,
        name: system.name || existingSystem.name,
        type: system.type || existingSystem.type,
        flavor: system.flavor,
        voice: system.voice,
        systemId: system.systemId,
        wacn: system.wacn,
        nac: system.nac,
        stateId: existingSystem.stateId,
        countyId: existingSystem.countyId,
        isActive: true,
      });
    }

    // Save sites
    for (const site of sites) {
      upsertSite(site);
    }

    // Save frequencies
    if (frequencies.length > 0) {
      insertFrequencies(frequencies);
    }

    // Save talkgroups
    if (talkgroups.length > 0) {
      insertTalkgroups(talkgroups);
    }

    progress.completedSystems.push(systemId);
  } catch (error) {
    progress.errors.push({
      entity: 'system_details',
      id: systemId,
      error: String(error),
    });
  }
}

async function main(): Promise<void> {
  console.log(`
================================================================================
                    COMPREHENSIVE US P25 NETWORK SCRAPER
================================================================================

This script will scrape ALL P25 trunked systems from RadioReference.com
for the entire United States. This includes:
- All 50 states + territories
- All counties in each state
- All P25 systems in each county
- Full details (talkgroups, frequencies) for each system

This process will take several hours. Progress is saved automatically.
You can stop and resume at any time using --resume.

================================================================================
`);

  const startTime = Date.now();

  // Initialize database
  initializeDatabase();

  // Authenticate
  const authenticated = await scraper.authenticate();
  console.log(authenticated ? 'Authenticated with RadioReference' : 'Running without authentication\n');

  // Load or initialize progress
  let progress = args.resume ? loadProgress() : {
    currentPhase: 'states' as const,
    currentStateId: null,
    currentCountyId: null,
    completedStates: [],
    completedCounties: [],
    completedSystems: [],
    totalStates: 0,
    totalCounties: 0,
    totalSystems: 0,
    errors: [],
  };

  if (args.resume && progress.completedStates.length > 0) {
    console.log(`Resuming from previous run:`);
    console.log(`  States completed: ${progress.completedStates.length}`);
    console.log(`  Counties completed: ${progress.completedCounties.length}`);
    console.log(`  Systems completed: ${progress.completedSystems.length}`);
    console.log('');
  }

  // Phase 1: Get all states
  console.log('PHASE 1: Fetching state list...');
  const states = await scraper.getStates();
  progress.totalStates = states.length;
  console.log(`Found ${states.length} states/territories\n`);

  // Save all states
  for (const state of states) {
    upsertState(state);
  }

  // Phase 2 & 3: Process each state
  console.log('PHASE 2 & 3: Processing states and counties...\n');

  for (let stateIdx = 0; stateIdx < states.length; stateIdx++) {
    const state = states[stateIdx];

    if (progress.completedStates.includes(state.id)) {
      console.log(`[${stateIdx + 1}/${states.length}] ${state.abbreviation} - ${state.name} (already completed)`);
      continue;
    }

    console.log(`\n[${stateIdx + 1}/${states.length}] ${state.abbreviation} - ${state.name}`);
    progress.currentStateId = state.id;
    progress.currentPhase = 'counties';

    // Get counties for this state
    let counties: RRCounty[] = [];
    try {
      counties = await scraper.getCounties(state.id);
      console.log(`  Found ${counties.length} counties`);
    } catch (error) {
      console.error(`  Error fetching counties: ${error}`);
      progress.errors.push({ entity: 'state_counties', id: state.id, error: String(error) });
    }

    // Save counties
    for (const county of counties) {
      upsertCounty(county);
      progress.totalCounties++;
    }

    // Get state-level P25 systems
    try {
      const stateSystems = await scraper.getP25SystemsForState(state.id);
      console.log(`  Found ${stateSystems.length} state-level P25 systems`);

      for (const system of stateSystems) {
        upsertSystem(system);
        progress.totalSystems++;

        if (!args['skip-details'] && !progress.completedSystems.includes(system.id)) {
          process.stdout.write(`    Fetching details for ${system.name}...`);
          await syncSystemDetails(system.id, progress);
          console.log(' done');
        }
      }
    } catch (error) {
      console.error(`  Error fetching state systems: ${error}`);
    }

    // Process each county
    progress.currentPhase = 'systems';
    let countySystemCount = 0;

    for (let countyIdx = 0; countyIdx < counties.length; countyIdx++) {
      const county = counties[countyIdx];

      if (progress.completedCounties.includes(county.id)) {
        continue;
      }

      const systemCount = await syncCountySystems(
        state.id,
        county.id,
        county.name,
        progress,
        args['skip-details'] || false
      );

      if (systemCount > 0) {
        console.log(`    ${county.name}: ${systemCount} P25 systems`);
        countySystemCount += systemCount;
      }

      // Save progress periodically
      if (countyIdx % 10 === 0) {
        saveProgress(progress);
      }
    }

    if (countySystemCount > 0) {
      console.log(`  Total from counties: ${countySystemCount} P25 systems`);
    }

    progress.completedStates.push(state.id);
    saveProgress(progress);

    // Show progress
    const elapsed = Date.now() - startTime;
    const avgTimePerState = elapsed / (stateIdx + 1);
    const remainingStates = states.length - stateIdx - 1;
    const estimatedRemaining = avgTimePerState * remainingStates;

    console.log(`  Progress: ${Math.round(((stateIdx + 1) / states.length) * 100)}% | ETA: ${formatDuration(estimatedRemaining)}`);
  }

  // Rebuild search index
  console.log('\n\nRebuilding search index...');
  try {
    rebuildSearchIndex();
    console.log('Search index rebuilt successfully');
  } catch (error) {
    console.error('Error rebuilding search index:', error);
  }

  // Final summary
  const totalTime = Date.now() - startTime;
  const stats = getSystemStats();

  console.log(`
================================================================================
                              SYNC COMPLETE
================================================================================

Duration: ${formatDuration(totalTime)}

States processed:  ${progress.completedStates.length}/${progress.totalStates}
Counties scraped:  ${progress.completedCounties.length}
Systems scraped:   ${progress.completedSystems.length}

Database Totals:
  Total P25 Systems:  ${stats.p25Systems.toLocaleString()}
  Total Talkgroups:   ${stats.totalTalkgroups.toLocaleString()}
  Total Sites:        ${stats.totalSites.toLocaleString()}

${progress.errors.length > 0 ? `\nErrors encountered: ${progress.errors.length}` : ''}
================================================================================
`);

  // Save final progress
  saveProgress(progress);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
