#!/usr/bin/env tsx
/**
 * RadioReference Sync Script
 *
 * Syncs P25 trunked system data from RadioReference.com into the local database.
 *
 * Usage:
 *   npm run sync:rr                    # Sync all states
 *   npm run sync:rr -- --states CA,AZ  # Sync specific states
 *   npm run sync:rr -- --system 12345  # Sync specific system
 *   npm run sync:rr -- --p25-only      # Only sync P25 systems (default)
 */

import 'dotenv/config';
import { parseArgs } from 'util';
import { initializeDatabase } from '../db/index.js';
import {
  upsertState,
  upsertCounty,
  upsertSystem,
  upsertSite,
  insertFrequencies,
  insertTalkgroups,
  updateSyncProgress,
  clearSyncProgress,
  getSystemStats,
  rebuildSearchIndex,
} from '../db/radioreference.js';
import { RadioReferenceScraper } from '../services/radioreference/scraper.js';
import type { RRSystem } from '../services/radioreference/types.js';

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    states: { type: 'string', short: 's' },
    system: { type: 'string' },
    'p25-only': { type: 'boolean', default: true },
    full: { type: 'boolean', default: false },
    'delay-ms': { type: 'string', default: '500' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help) {
  console.log(`
RadioReference Sync Script

Usage:
  npm run sync:rr                      Sync all US states
  npm run sync:rr -- --states CA,AZ    Sync specific states (comma-separated abbreviations)
  npm run sync:rr -- --system 12345    Sync a specific system by ID
  npm run sync:rr -- --full            Fetch full details for all systems
  npm run sync:rr -- --delay-ms 1000   Set delay between requests (default: 500)
  npm run sync:rr -- --p25-only        Only sync P25 systems (default: true)

Environment Variables:
  RR_USERNAME    RadioReference username (for premium data)
  RR_PASSWORD    RadioReference password
  `);
  process.exit(0);
}

const delayMs = parseInt(args['delay-ms'] || '500', 10);
const scraper = new RadioReferenceScraper(delayMs);

async function syncState(stateId: number, stateName: string, p25Only: boolean): Promise<number> {
  console.log(`\n  Fetching systems for ${stateName}...`);
  let systems: RRSystem[];

  try {
    if (p25Only) {
      systems = await scraper.getP25SystemsForState(stateId);
    } else {
      systems = await scraper.getTrunkedSystems(stateId);
    }
  } catch (error) {
    console.error(`    Error fetching systems for ${stateName}:`, error);
    return 0;
  }

  console.log(`    Found ${systems.length} ${p25Only ? 'P25 ' : ''}systems`);

  for (const system of systems) {
    try {
      upsertSystem(system);
    } catch (error) {
      console.error(`    Error saving system ${system.name}:`, error);
    }
  }

  return systems.length;
}

async function syncSystemDetails(systemId: number): Promise<void> {
  console.log(`\n  Fetching details for system ${systemId}...`);
  updateSyncProgress('system', systemId, 'in_progress');

  try {
    const { system, sites, frequencies, talkgroups } = await scraper.getSystemDetails(systemId);

    // Update system with additional details
    if (system.id) {
      upsertSystem({
        id: system.id,
        name: system.name || `System ${systemId}`,
        type: system.type || 'Unknown',
        flavor: system.flavor,
        voice: system.voice,
        systemId: system.systemId,
        wacn: system.wacn,
        nac: system.nac,
        stateId: 0, // Will be preserved from existing record
        isActive: true,
      });
    }

    // Save sites
    for (const site of sites) {
      upsertSite(site);
    }
    console.log(`    Saved ${sites.length} sites`);

    // Save frequencies
    if (frequencies.length > 0) {
      insertFrequencies(frequencies);
      console.log(`    Saved ${frequencies.length} frequencies`);
    }

    // Save talkgroups
    if (talkgroups.length > 0) {
      insertTalkgroups(talkgroups);
      console.log(`    Saved ${talkgroups.length} talkgroups`);
    }

    updateSyncProgress('system', systemId, 'completed');
  } catch (error) {
    console.error(`    Error syncing system ${systemId}:`, error);
    updateSyncProgress('system', systemId, 'failed', String(error));
  }
}

async function syncCounties(stateId: number): Promise<void> {
  console.log(`  Fetching counties...`);
  try {
    const counties = await scraper.getCounties(stateId);
    console.log(`    Found ${counties.length} counties`);
    for (const county of counties) {
      upsertCounty(county);
    }
  } catch (error) {
    console.error(`    Error fetching counties:`, error);
  }
}

async function main(): Promise<void> {
  console.log('RadioReference Sync Script');
  console.log('==========================\n');

  // Initialize database
  initializeDatabase();

  // Authenticate if credentials are available
  const authenticated = await scraper.authenticate();
  if (!authenticated) {
    console.log('Running without authentication (limited data access)\n');
  }

  // Single system sync
  if (args.system) {
    const systemId = parseInt(args.system, 10);
    console.log(`Syncing single system: ${systemId}`);
    await syncSystemDetails(systemId);
    console.log('\nDone!');
    return;
  }

  // Determine which states to sync
  let statesToSync: string[] = [];
  if (args.states) {
    statesToSync = args.states.split(',').map((s) => s.trim().toUpperCase());
    console.log(`Syncing specific states: ${statesToSync.join(', ')}`);
  } else {
    console.log('Syncing all US states');
  }

  // Clear previous sync progress
  clearSyncProgress();

  // Fetch states
  console.log('\nFetching state list...');
  const states = await scraper.getStates();
  console.log(`Found ${states.length} states/territories`);

  // Filter states if specified
  const filteredStates = statesToSync.length > 0
    ? states.filter((s) => statesToSync.includes(s.abbreviation))
    : states;

  if (filteredStates.length === 0) {
    console.error('No matching states found!');
    process.exit(1);
  }

  let totalSystems = 0;

  // Sync each state
  for (const state of filteredStates) {
    console.log(`\n[${state.abbreviation}] ${state.name}`);
    updateSyncProgress('state', state.id, 'in_progress');

    // Save state
    upsertState(state);

    // Sync counties
    await syncCounties(state.id);

    // Sync systems
    const systemCount = await syncState(state.id, state.name, args['p25-only'] !== false);
    totalSystems += systemCount;

    updateSyncProgress('state', state.id, 'completed');
  }

  // If full sync, get details for all systems
  if (args.full) {
    console.log('\n\nFetching full details for all systems...');
    const { systems } = await import('../db/radioreference.js').then((m) => m.getSystems({ limit: 10000 }));

    for (const system of systems) {
      await syncSystemDetails(system.id);
    }
  }

  // Rebuild search index
  console.log('\n\nRebuilding search index...');
  try {
    rebuildSearchIndex();
    console.log('Search index rebuilt successfully');
  } catch (error) {
    console.error('Error rebuilding search index:', error);
  }

  // Print summary
  const stats = getSystemStats();
  console.log('\n==========================');
  console.log('Sync Complete!');
  console.log(`  States synced: ${filteredStates.length}`);
  console.log(`  Systems found: ${totalSystems}`);
  console.log(`\nDatabase totals:`);
  console.log(`  Total systems: ${stats.totalSystems}`);
  console.log(`  P25 systems: ${stats.p25Systems}`);
  console.log(`  Total talkgroups: ${stats.totalTalkgroups}`);
  console.log(`  Total sites: ${stats.totalSites}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
