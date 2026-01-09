import * as cheerio from 'cheerio';
import { config } from '../../config/index.js';
import type {
  RRState,
  RRCounty,
  RRSystem,
  RRSite,
  RRFrequency,
  RRTalkgroup,
} from './types.js';

const BASE_URL = 'https://www.radioreference.com';

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

export class RadioReferenceScraper {
  private cookieJar: CookieJar;
  private isAuthenticated = false;
  private delayMs: number;

  constructor(delayMs = 500) {
    this.cookieJar = createCookieJar();
    this.delayMs = delayMs;
  }

  private async delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      Cookie: this.cookieJar.get(),
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, { ...options, headers, redirect: 'manual' });
    this.cookieJar.set(response.headers.get('set-cookie'));

    // Handle redirects manually to preserve cookies
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get('location');
      if (location) {
        const redirectUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
        return this.fetch(redirectUrl, options);
      }
    }

    return response;
  }

  async authenticate(): Promise<boolean> {
    const { username, password } = config.radioReference;
    if (!username || !password) {
      console.log('No RadioReference credentials configured');
      return false;
    }

    try {
      // First, get the login page to get any CSRF tokens
      const loginPageResponse = await this.fetch(`${BASE_URL}/account/`);
      const loginPageHtml = await loginPageResponse.text();
      const $loginPage = cheerio.load(loginPageHtml);

      // Find the login form and any hidden fields
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      formData.append('option', 'com_users');
      formData.append('task', 'user.login');
      formData.append('return', '');

      // Look for hidden fields in the form
      $loginPage('form input[type="hidden"]').each((_, el) => {
        const name = $loginPage(el).attr('name');
        const value = $loginPage(el).attr('value');
        if (name && value && !formData.has(name)) {
          formData.append(name, value);
        }
      });

      const response = await this.fetch(`${BASE_URL}/account/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const html = await response.text();

      // Check if login was successful by looking for logout link or username
      this.isAuthenticated = html.includes('Logout') || html.includes('My Account') || html.includes(username);

      if (this.isAuthenticated) {
        console.log('Successfully authenticated with RadioReference');
      } else {
        console.log('Authentication may have failed - continuing anyway');
      }

      return this.isAuthenticated;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  async getStates(): Promise<RRState[]> {
    await this.delay();
    const response = await this.fetch(`${BASE_URL}/db/browse/`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const states: RRState[] = [];

    // States are in a dropdown select element with id="stidSelectorValue"
    $('#stidSelectorValue option, select[name="stid"] option').each((_, el) => {
      const value = $(el).attr('value');
      const name = $(el).text().trim();
      if (value && name && value !== '0' && value !== '') {
        const id = parseInt(value, 10);
        if (!isNaN(id) && id > 0 && !states.find((s) => s.id === id)) {
          states.push({
            id,
            name,
            abbreviation: this.stateIdToAbbrev(id),
            countryId: 1,
          });
        }
      }
    });

    // If dropdown parsing failed, try alternate selectors
    if (states.length === 0) {
      // Try generic select options
      $('select option').each((_, el) => {
        const value = $(el).attr('value');
        const name = $(el).text().trim();
        // Check if this looks like a state (option value is 1-56 for US states)
        if (value && name && /^[1-9]\d?$/.test(value)) {
          const id = parseInt(value, 10);
          if (id >= 1 && id <= 56 && !states.find((s) => s.id === id)) {
            states.push({
              id,
              name,
              abbreviation: this.stateIdToAbbrev(id),
              countryId: 1,
            });
          }
        }
      });
    }

    return states;
  }

  async getCounties(stateId: number): Promise<RRCounty[]> {
    await this.delay();
    const response = await this.fetch(`${BASE_URL}/db/browse/stid/${stateId}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const counties: RRCounty[] = [];

    // Counties are in a dropdown select with id="ctidSelectorValue"
    $('#ctidSelectorValue option, select[name="ctid"] option').each((_, el) => {
      const value = $(el).attr('value');
      const name = $(el).text().trim();
      if (value && name && value !== '0' && value !== '') {
        const id = parseInt(value, 10);
        if (!isNaN(id) && id > 0 && !counties.find((c) => c.id === id)) {
          counties.push({ id, stateId, name });
        }
      }
    });

    // Fallback: look for county links if dropdown not found
    if (counties.length === 0) {
      $('a[href*="/db/browse/ctid/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/db\/browse\/ctid\/(\d+)/);
        if (match) {
          const id = parseInt(match[1], 10);
          const name = $(el).text().trim();
          if (name && !counties.find((c) => c.id === id)) {
            counties.push({ id, stateId, name });
          }
        }
      });
    }

    return counties;
  }

  async getTrunkedSystems(stateId: number): Promise<RRSystem[]> {
    await this.delay();
    const response = await this.fetch(`${BASE_URL}/db/browse/stid/${stateId}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const systems: RRSystem[] = [];

    // Look for trunked system links in table rows
    $('a[href*="/db/sid/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/db\/sid\/(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        const name = $(el).text().trim();

        // Try to get system type from the row (usually in adjacent td)
        let type = 'Unknown';
        const $row = $(el).closest('tr');
        if ($row.length) {
          // Get text from all cells in the row
          const rowText = $row.text();
          const typeMatch = rowText.match(/(Project 25 Phase II|Project 25|P25 Phase II|P25|DMR|LTR|EDACS|Motorola|NXDN)/i);
          if (typeMatch) {
            type = typeMatch[1];
          }
        } else {
          // Fallback: check parent text
          const parentText = $(el).parent().text();
          const typeMatch = parentText.match(/(Project 25|P25|DMR|LTR|EDACS|Motorola|NXDN)/i);
          if (typeMatch) {
            type = typeMatch[1];
          }
        }

        if (name && !systems.find((s) => s.id === id)) {
          systems.push({
            id,
            name,
            type: this.normalizeSystemType(type),
            stateId,
            isActive: true,
          });
        }
      }
    });

    return systems;
  }

  async getSystemDetails(systemId: number): Promise<{
    system: Partial<RRSystem>;
    sites: RRSite[];
    frequencies: RRFrequency[];
    talkgroups: RRTalkgroup[];
  }> {
    await this.delay();
    const response = await this.fetch(`${BASE_URL}/db/sid/${systemId}`);
    const html = await response.text();
    const $ = cheerio.load(html);

    const system: Partial<RRSystem> = { id: systemId };
    const sites: RRSite[] = [];
    const frequencies: RRFrequency[] = [];
    const talkgroups: RRTalkgroup[] = [];

    // Parse system name
    const titleEl = $('h1, .page-header, title').first();
    if (titleEl.length) {
      system.name = titleEl.text().replace('Trunked System', '').trim().split('|')[0].trim();
    }

    // Parse system type from page content
    const pageText = $('body').text();
    if (pageText.includes('Project 25 Phase II') || pageText.includes('P25 Phase II')) {
      system.type = 'P25 Phase II';
      system.flavor = 'Phase II';
    } else if (pageText.includes('Project 25') || pageText.includes('P25')) {
      system.type = 'P25';
      system.flavor = 'Phase I';
    }

    // Parse WACN, System ID, NAC
    const wacnMatch = pageText.match(/WACN[:\s]+([0-9A-Fa-f]+)/);
    if (wacnMatch) system.wacn = wacnMatch[1];

    const sysIdMatch = pageText.match(/System\s*ID[:\s]+([0-9A-Fa-f]+)/);
    if (sysIdMatch) system.systemId = sysIdMatch[1];

    const nacMatch = pageText.match(/NAC[:\s]+([0-9A-Fa-f]+)/);
    if (nacMatch) system.nac = nacMatch[1];

    // Parse sites
    const siteTable = $('table').filter((_, el) => {
      return $(el).text().includes('Site') && $(el).text().includes('Frequencies');
    });

    let siteIdCounter = 1;
    siteTable.find('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const siteText = cells.first().text().trim();
        const siteNameMatch = siteText.match(/^([\d-]+)\s*[-–]\s*(.+)/);

        if (siteNameMatch) {
          const siteId = systemId * 1000 + siteIdCounter++;
          const site: RRSite = {
            id: siteId,
            systemId,
            name: siteNameMatch[2].trim(),
            siteId: parseInt(siteNameMatch[1].replace(/-/g, ''), 10) || siteIdCounter,
          };
          sites.push(site);

          // Parse frequencies from this row
          const freqText = cells.eq(1).text();
          const freqMatches = freqText.match(/(\d{3}\.\d+)/g);
          if (freqMatches) {
            freqMatches.forEach((freqStr, idx) => {
              const freq = parseFloat(freqStr) * 1000000; // Convert MHz to Hz
              frequencies.push({
                siteId,
                systemId,
                frequency: Math.round(freq),
                channelType: idx === 0 ? 'control' : 'voice',
                isPrimary: idx === 0,
              });
            });
          }
        }
      }
    });

    // Parse talkgroups
    const tgTable = $('table').filter((_, el) => {
      const text = $(el).text();
      return (text.includes('DEC') || text.includes('Talkgroup')) && text.includes('Alpha');
    });

    tgTable.find('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 3) {
        const decText = cells.eq(0).text().trim();
        const alphaTag = cells.eq(1).text().trim();
        const description = cells.eq(2).text().trim();
        const mode = cells.length > 3 ? cells.eq(3).text().trim() : 'D';
        const tag = cells.length > 4 ? cells.eq(4).text().trim() : undefined;

        // Parse talkgroup ID (handle various formats)
        const tgIdMatch = decText.match(/(\d+)/);
        if (tgIdMatch) {
          const talkgroupId = parseInt(tgIdMatch[1], 10);
          if (!isNaN(talkgroupId) && talkgroupId > 0) {
            talkgroups.push({
              systemId,
              talkgroupId,
              alphaTag: alphaTag || undefined,
              description: description || undefined,
              mode: mode || 'D',
              tag,
            });
          }
        }
      }
    });

    return { system, sites, frequencies, talkgroups };
  }

  async getP25SystemsForState(stateId: number): Promise<RRSystem[]> {
    const allSystems = await this.getTrunkedSystems(stateId);
    return allSystems.filter(
      (s) => s.type.includes('P25') || s.type.includes('Project 25')
    );
  }

  private normalizeSystemType(type: string): string {
    const typeUpper = type.toUpperCase();
    if (typeUpper.includes('P25') || typeUpper.includes('PROJECT 25')) {
      if (typeUpper.includes('PHASE II') || typeUpper.includes('PHASE 2')) {
        return 'P25 Phase II';
      }
      return 'P25';
    }
    if (typeUpper.includes('DMR')) return 'DMR';
    if (typeUpper.includes('LTR')) return 'LTR';
    if (typeUpper.includes('EDACS')) return 'EDACS';
    if (typeUpper.includes('MOTOROLA')) return 'Motorola';
    if (typeUpper.includes('NXDN')) return 'NXDN';
    return type;
  }

  private stateIdToAbbrev(stateId: number): string {
    // RadioReference state IDs to abbreviations mapping (based on RR's actual IDs)
    const stateMap: Record<number, string> = {
      1: 'AL',   // Alabama
      2: 'AK',   // Alaska
      4: 'AZ',   // Arizona
      5: 'AR',   // Arkansas
      6: 'CA',   // California
      8: 'CO',   // Colorado
      9: 'CT',   // Connecticut
      10: 'DE',  // Delaware
      11: 'DC',  // District of Columbia
      12: 'FL',  // Florida
      13: 'GA',  // Georgia
      66: 'GU',  // Guam
      15: 'HI',  // Hawaii
      16: 'ID',  // Idaho
      17: 'IL',  // Illinois
      18: 'IN',  // Indiana
      19: 'IA',  // Iowa
      20: 'KS',  // Kansas
      21: 'KY',  // Kentucky
      22: 'LA',  // Louisiana
      23: 'ME',  // Maine
      24: 'MD',  // Maryland
      25: 'MA',  // Massachusetts
      26: 'MI',  // Michigan
      27: 'MN',  // Minnesota
      28: 'MS',  // Mississippi
      29: 'MO',  // Missouri
      30: 'MT',  // Montana
      31: 'NE',  // Nebraska
      32: 'NV',  // Nevada
      33: 'NH',  // New Hampshire
      34: 'NJ',  // New Jersey
      35: 'NM',  // New Mexico
      36: 'NY',  // New York
      37: 'NC',  // North Carolina
      38: 'ND',  // North Dakota
      39: 'OH',  // Ohio
      40: 'OK',  // Oklahoma
      41: 'OR',  // Oregon
      42: 'PA',  // Pennsylvania
      72: 'PR',  // Puerto Rico
      44: 'RI',  // Rhode Island
      45: 'SC',  // South Carolina
      46: 'SD',  // South Dakota
      47: 'TN',  // Tennessee
      48: 'TX',  // Texas
      49: 'UT',  // Utah
      50: 'VT',  // Vermont
      78: 'VI',  // Virgin Islands
      51: 'VA',  // Virginia
      53: 'WA',  // Washington
      54: 'WV',  // West Virginia
      55: 'WI',  // Wisconsin
      56: 'WY',  // Wyoming
    };
    return stateMap[stateId] || 'XX';
  }
}

export const scraper = new RadioReferenceScraper(config.radioReference.syncDelayMs);
