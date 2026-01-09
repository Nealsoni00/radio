import type { FastifyInstance } from 'fastify';
import {
  getStates,
  getState,
  getCounties,
  getCounty,
  getSystems,
  getSystem,
  getSites,
  getFrequencies,
  getTalkgroups,
  searchSystems,
  searchTalkgroups,
  getSelectedSystems,
  addSelectedSystem,
  removeSelectedSystem,
  getSystemStats,
  getSystemCountsByGeography,
  getControlChannelsForCounty,
  getControlChannelsForState,
} from '../../db/radioreference.js';

export async function radioReferenceRoutes(app: FastifyInstance): Promise<void> {
  // Get all states
  app.get('/api/rr/states', async () => {
    const states = getStates();
    return { states };
  });

  // Get state by ID
  app.get<{ Params: { id: string } }>('/api/rr/states/:id', async (request) => {
    const id = parseInt(request.params.id, 10);
    const state = getState(id);
    if (!state) {
      throw { statusCode: 404, message: 'State not found' };
    }
    return { state };
  });

  // Get counties for a state
  app.get<{ Params: { id: string } }>('/api/rr/states/:id/counties', async (request) => {
    const stateId = parseInt(request.params.id, 10);
    const counties = getCounties(stateId);
    return { counties };
  });

  // Get county by ID
  app.get<{ Params: { id: string } }>('/api/rr/counties/:id', async (request) => {
    const id = parseInt(request.params.id, 10);
    const county = getCounty(id);
    if (!county) {
      throw { statusCode: 404, message: 'County not found' };
    }
    return { county };
  });

  // Get systems with filters
  app.get<{
    Querystring: {
      state?: string;
      county?: string;
      type?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/rr/systems', async (request) => {
    const { state, county, type, search, limit, offset } = request.query;
    const result = getSystems({
      stateId: state ? parseInt(state, 10) : undefined,
      countyId: county ? parseInt(county, 10) : undefined,
      type,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return result;
  });

  // Get system by ID
  app.get<{ Params: { id: string } }>('/api/rr/systems/:id', async (request) => {
    const id = parseInt(request.params.id, 10);
    const system = getSystem(id);
    if (!system) {
      throw { statusCode: 404, message: 'System not found' };
    }

    const sites = getSites(id);
    const frequencies = getFrequencies(id);
    const { talkgroups, total: talkgroupCount } = getTalkgroups({ systemId: id, limit: 1000 });

    return { system, sites, frequencies, talkgroups, talkgroupCount };
  });

  // Get sites for a system
  app.get<{ Params: { id: string } }>('/api/rr/systems/:id/sites', async (request) => {
    const systemId = parseInt(request.params.id, 10);
    const sites = getSites(systemId);
    return { sites };
  });

  // Get frequencies for a system
  app.get<{ Params: { id: string } }>('/api/rr/systems/:id/frequencies', async (request) => {
    const systemId = parseInt(request.params.id, 10);
    const frequencies = getFrequencies(systemId);
    return { frequencies };
  });

  // Get talkgroups for a system
  app.get<{
    Params: { id: string };
    Querystring: {
      category?: string;
      tag?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/rr/systems/:id/talkgroups', async (request) => {
    const systemId = parseInt(request.params.id, 10);
    const { category, tag, limit, offset } = request.query;
    const result = getTalkgroups({
      systemId,
      category,
      tag,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return result;
  });

  // Search systems and talkgroups
  app.get<{
    Querystring: {
      q: string;
      state?: string;
      type?: string;
      limit?: string;
    };
  }>('/api/rr/search', async (request) => {
    const { q, state, type, limit } = request.query;
    if (!q || q.length < 2) {
      return { systems: [], talkgroups: [], total: 0 };
    }

    const limitNum = limit ? parseInt(limit, 10) : 20;
    const stateId = state ? parseInt(state, 10) : undefined;

    const systems = searchSystems(q, { stateId, type, limit: limitNum });
    const talkgroups = searchTalkgroups(q, { limit: limitNum });

    return {
      systems,
      talkgroups,
      total: systems.length + talkgroups.length,
    };
  });

  // Get user's selected systems
  app.get('/api/rr/selected', async () => {
    const systems = getSelectedSystems();
    return { systems };
  });

  // Add system to selection
  app.post<{ Body: { systemId: number; priority?: number } }>('/api/rr/selected', async (request) => {
    const { systemId, priority } = request.body;
    addSelectedSystem(systemId, priority);
    return { success: true };
  });

  // Remove system from selection
  app.delete<{ Params: { id: string } }>('/api/rr/selected/:id', async (request) => {
    const systemId = parseInt(request.params.id, 10);
    removeSelectedSystem(systemId);
    return { success: true };
  });

  // Get control channels for scanning in a county
  app.get<{ Params: { id: string } }>('/api/rr/counties/:id/control-channels', async (request) => {
    const countyId = parseInt(request.params.id, 10);
    const controlChannels = getControlChannelsForCounty(countyId);
    const county = getCounty(countyId);
    return {
      controlChannels,
      county,
      total: controlChannels.length,
      uniqueSystems: new Set(controlChannels.map(c => c.systemId)).size,
    };
  });

  // Get control channels for scanning in a state
  app.get<{ Params: { id: string } }>('/api/rr/states/:id/control-channels', async (request) => {
    const stateId = parseInt(request.params.id, 10);
    const controlChannels = getControlChannelsForState(stateId);
    const state = getState(stateId);
    return {
      controlChannels,
      state,
      total: controlChannels.length,
      uniqueSystems: new Set(controlChannels.map(c => c.systemId)).size,
    };
  });

  // Generate trunk-recorder config
  app.get('/api/rr/generate-config', async () => {
    const selectedSystems = getSelectedSystems();

    if (selectedSystems.length === 0) {
      return {
        error: 'No systems selected',
        config: null,
      };
    }

    // Get frequencies for all selected systems
    const systemConfigs = [];
    for (const system of selectedSystems) {
      const frequencies = getFrequencies(system.id);
      const controlChannels = frequencies
        .filter((f) => f.channelType === 'control')
        .map((f) => f.frequency);

      const { talkgroups } = getTalkgroups({ systemId: system.id, limit: 10000 });

      systemConfigs.push({
        shortName: system.name.substring(0, 16).toLowerCase().replace(/[^a-z0-9]/g, '-'),
        type: 'p25',
        talkgroupsFile: `${system.id}-talkgroups.csv`,
        control_channels: controlChannels,
        modulation: system.flavor === 'Phase II' ? 'qpsk' : 'cqpsk',
        systemId: system.systemId,
        wacn: system.wacn,
        nac: system.nac,
        _talkgroups: talkgroups, // Include for CSV generation
      });
    }

    // Calculate optimal center frequency
    const allFreqs = selectedSystems.flatMap((s) =>
      getFrequencies(s.id).map((f) => f.frequency)
    );
    const minFreq = Math.min(...allFreqs);
    const maxFreq = Math.max(...allFreqs);
    const centerFreq = Math.round((minFreq + maxFreq) / 2);
    const bandwidth = maxFreq - minFreq;

    const config = {
      ver: 2,
      sources: [
        {
          center: centerFreq,
          rate: Math.max(2400000, Math.ceil(bandwidth * 1.2)),
          gain: 40,
          digitalRecorders: Math.min(selectedSystems.length * 2, 8),
          driver: 'osmosdr',
          device: 'rtl=0',
        },
      ],
      systems: systemConfigs.map(({ _talkgroups, ...sys }) => sys),
      captureDir: './audio',
      statusServer: 'ws://127.0.0.1:3001',
      callTimeout: 3,
    };

    // Generate talkgroup CSV files content
    const talkgroupFiles: Record<string, string> = {};
    for (const sys of systemConfigs) {
      const csvLines = ['Decimal,Alpha Tag,Mode,Description,Category,Tag'];
      for (const tg of sys._talkgroups) {
        csvLines.push(
          `${tg.talkgroupId},"${tg.alphaTag || ''}",${tg.mode || 'D'},"${tg.description || ''}","${tg.category || ''}","${tg.tag || ''}"`
        );
      }
      talkgroupFiles[sys.talkgroupsFile] = csvLines.join('\n');
    }

    return {
      config,
      talkgroupFiles,
      centerFrequency: centerFreq,
      bandwidth,
    };
  });

  // Get database stats
  app.get('/api/rr/stats', async () => {
    const stats = getSystemStats();
    return { stats };
  });

  // Get system counts by geography (for map highlighting)
  app.get('/api/rr/geography-counts', async () => {
    const counts = getSystemCountsByGeography();
    return counts;
  });
}
