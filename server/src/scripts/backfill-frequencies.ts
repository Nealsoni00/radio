#!/usr/bin/env npx ts-node --esm
/**
 * Backfill frequency data from RadioReference
 *
 * This script fetches site and frequency data for systems that don't have it yet.
 * It scrapes RadioReference for each system and populates the database.
 *
 * Usage:
 *   npx ts-node --esm server/src/scripts/backfill-frequencies.ts [--limit N] [--system-id ID]
 *
 * Options:
 *   --limit N       Process at most N systems (default: 100)
 *   --system-id ID  Process only the specified system ID
 *   --all           Process all systems without frequency data
 *   --delay MS      Delay between requests in ms (default: 1000)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env
config({ path: resolve(__dirname, '../../.env') });

import { RadioReferenceScraper } from '../services/radioreference/scraper.js';
import {
  getSystemsWithoutFrequencies,
  insertSites,
  insertFrequencies,
  updateSystemDetails,
  getSystem,
} from '../db/radioreference-postgres.js';

interface Options {
  limit: number;
  systemId?: number;
  all: boolean;
  delay: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    limit: 100,
    all: false,
    delay: 1000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--system-id' && args[i + 1]) {
      options.systemId = parseInt(args[++i], 10);
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--delay' && args[i + 1]) {
      options.delay = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Backfill frequency data from RadioReference

Usage:
  npx ts-node --esm server/src/scripts/backfill-frequencies.ts [options]

Options:
  --limit N       Process at most N systems (default: 100)
  --system-id ID  Process only the specified system ID
  --all           Process all systems without frequency data
  --delay MS      Delay between requests in ms (default: 1000)
  --help          Show this help message
`);
      process.exit(0);
    }
  }

  if (options.all) {
    options.limit = 10000; // High limit for --all
  }

  return options;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillSystem(scraper: RadioReferenceScraper, systemId: number): Promise<{
  sites: number;
  frequencies: number;
  success: boolean;
  error?: string;
}> {
  try {
    console.log(`  Fetching details for system ${systemId}...`);
    const details = await scraper.getSystemDetails(systemId);

    // Update system metadata if we got new info
    if (details.system.wacn || details.system.nac || details.system.systemId) {
      await updateSystemDetails(systemId, details.system);
      console.log(`    Updated system metadata (WACN: ${details.system.wacn || 'N/A'}, NAC: ${details.system.nac || 'N/A'})`);
    }

    // Insert sites
    if (details.sites.length > 0) {
      await insertSites(details.sites);
      console.log(`    Inserted ${details.sites.length} sites`);
    }

    // Insert frequencies
    if (details.frequencies.length > 0) {
      await insertFrequencies(details.frequencies);
      console.log(`    Inserted ${details.frequencies.length} frequencies`);
    }

    if (details.sites.length === 0 && details.frequencies.length === 0) {
      console.log(`    No site/frequency data found on RadioReference page`);
    }

    return {
      sites: details.sites.length,
      frequencies: details.frequencies.length,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`    Error: ${message}`);
    return {
      sites: 0,
      frequencies: 0,
      success: false,
      error: message,
    };
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('RadioReference Frequency Backfill');
  console.log('='.repeat(60));
  console.log(`Delay between requests: ${options.delay}ms`);

  // Create scraper with configured delay
  const scraper = new RadioReferenceScraper(options.delay);

  // Authenticate with RadioReference
  console.log('\nAuthenticating with RadioReference...');
  const authenticated = await scraper.authenticate();
  if (!authenticated) {
    console.log('Warning: Not authenticated. Some data may not be accessible.');
    console.log('Set RR_USERNAME and RR_PASSWORD environment variables for full access.');
  }

  // Get systems to process
  let systems: { id: number; name: string }[];

  if (options.systemId) {
    // Process specific system
    const system = await getSystem(options.systemId);
    if (!system) {
      console.error(`System ${options.systemId} not found in database`);
      process.exit(1);
    }
    systems = [{ id: system.id, name: system.name }];
    console.log(`\nProcessing specific system: ${system.name} (ID: ${system.id})`);
  } else {
    // Get systems without frequency data
    systems = await getSystemsWithoutFrequencies(options.limit);
    console.log(`\nFound ${systems.length} systems without frequency data`);
    if (systems.length === 0) {
      console.log('All systems already have frequency data!');
      process.exit(0);
    }
  }

  console.log('\n' + '-'.repeat(60));

  // Process each system
  let processed = 0;
  let successful = 0;
  let totalSites = 0;
  let totalFrequencies = 0;
  const errors: { id: number; name: string; error: string }[] = [];

  for (const system of systems) {
    processed++;
    console.log(`\n[${processed}/${systems.length}] ${system.name} (ID: ${system.id})`);

    const result = await backfillSystem(scraper, system.id);

    if (result.success) {
      successful++;
      totalSites += result.sites;
      totalFrequencies += result.frequencies;
    } else {
      errors.push({ id: system.id, name: system.name, error: result.error || 'Unknown error' });
    }

    // Delay between requests to avoid rate limiting
    if (processed < systems.length) {
      await sleep(options.delay);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Systems processed: ${processed}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${errors.length}`);
  console.log(`Total sites added: ${totalSites}`);
  console.log(`Total frequencies added: ${totalFrequencies}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors.slice(0, 10)) {
      console.log(`  - ${err.name} (${err.id}): ${err.error}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log('\nDone!');
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
