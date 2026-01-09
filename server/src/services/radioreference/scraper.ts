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

    // Look for state links in the browse page
    $('a[href*="/db/browse/stid/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/db\/browse\/stid\/(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        const name = $(el).text().trim();
        // Extract abbreviation from name or use state ID lookup
        const abbrevMatch = name.match(/\(([A-Z]{2})\)/) || [];
        const abbreviation = abbrevMatch[1] || this.stateIdToAbbrev(id);

        if (name && !states.find((s) => s.id === id)) {
          states.push({
            id,
            name: name.replace(/\s*\([A-Z]{2}\)\s*/, '').trim(),
            abbreviation,
            countryId: 1,
          });
        }
      }
    });

    return states;
  }

  async getCounties(stateId: number): Promise<RRCounty[]> {
    await this.delay();
    const response = await this.fetch(`${BASE_URL}/db/browse/stid/${stateId}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const counties: RRCounty[] = [];

    // Look for county links
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

    return counties;
  }

  async getTrunkedSystems(stateId: number): Promise<RRSystem[]> {
    await this.delay();
    const response = await this.fetch(`${BASE_URL}/db/browse/stid/${stateId}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const systems: RRSystem[] = [];

    // Look for trunked system links
    $('a[href*="/db/sid/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/db\/sid\/(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        const name = $(el).text().trim();
        // Try to get system type from surrounding text
        const parentText = $(el).parent().text();
        const typeMatch = parentText.match(/(Project 25|P25|DMR|LTR|EDACS|Motorola|NXDN)/i);
        const type = typeMatch ? typeMatch[1] : 'Unknown';

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
    // RadioReference state IDs to abbreviations mapping
    const stateMap: Record<number, string> = {
      1: 'AL', 2: 'AK', 3: 'AZ', 4: 'AR', 5: 'CA', 6: 'CO', 7: 'CT', 8: 'DE',
      9: 'FL', 10: 'GA', 11: 'HI', 12: 'ID', 13: 'IL', 14: 'IN', 15: 'IA',
      16: 'KS', 17: 'KY', 18: 'LA', 19: 'ME', 20: 'MD', 21: 'MA', 22: 'MI',
      23: 'MN', 24: 'MS', 25: 'MO', 26: 'MT', 27: 'NE', 28: 'NV', 29: 'NH',
      30: 'NJ', 31: 'NM', 32: 'NY', 33: 'NC', 34: 'ND', 35: 'OH', 36: 'OK',
      37: 'OR', 38: 'PA', 39: 'RI', 40: 'SC', 41: 'SD', 42: 'TN', 43: 'TX',
      44: 'UT', 45: 'VT', 46: 'VA', 47: 'WA', 48: 'WV', 49: 'WI', 50: 'WY',
      51: 'DC', 52: 'PR', 53: 'VI', 54: 'GU', 55: 'AS', 56: 'MP',
    };
    return stateMap[stateId] || 'XX';
  }
}

export const scraper = new RadioReferenceScraper(config.radioReference.syncDelayMs);
