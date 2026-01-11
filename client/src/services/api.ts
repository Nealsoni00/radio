import type {
  Call,
  Talkgroup,
  Channel,
  SystemConfig,
  CallSource,
  SDRConfig,
  ActiveSystemInfo,
  RRState,
  RRCounty,
  RRSystem,
  RRSite,
  RRFrequency,
  RRTalkgroup,
  RRSearchResult,
  RRStats,
} from '../types';

const API_BASE = '/api';

export async function getCalls(params?: {
  limit?: number;
  offset?: number;
  talkgroup?: number;
  since?: number;
  emergency?: boolean;
}): Promise<{ calls: Call[] }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.talkgroup) searchParams.set('talkgroup', params.talkgroup.toString());
  if (params?.since) searchParams.set('since', params.since.toString());
  if (params?.emergency !== undefined) searchParams.set('emergency', params.emergency.toString());

  const url = `${API_BASE}/calls${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch calls');
  return response.json();
}

export async function getCall(id: string): Promise<{ call: Call; sources: CallSource[] }> {
  const response = await fetch(`${API_BASE}/calls/${id}`);
  if (!response.ok) throw new Error('Failed to fetch call');
  return response.json();
}

export async function getTalkgroups(): Promise<{ talkgroups: Talkgroup[] }> {
  const response = await fetch(`${API_BASE}/talkgroups`);
  if (!response.ok) throw new Error('Failed to fetch talkgroups');
  return response.json();
}

export async function getHealth(): Promise<{
  status: string;
  timestamp: number;
  trunkRecorder: boolean;
  fileWatcher?: boolean;
  fileWatcherActive?: boolean;
  audioReceiver: boolean;
  clients: number;
}> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Failed to fetch health');
  return response.json();
}

export function getAudioUrl(callId: string): string {
  return `${API_BASE}/audio/${callId}`;
}

export async function getSDRConfig(): Promise<SDRConfig> {
  const response = await fetch(`${API_BASE}/sdr`);
  if (!response.ok) throw new Error('Failed to fetch SDR config');
  return response.json();
}

export interface RTLDevice {
  index: number;
  name: string;
  manufacturer: string;
  product: string;
  serial: string;
  connected: boolean;
}

export interface SDRDeviceStatus {
  devices: RTLDevice[];
  totalDevices: number;
  lastChecked: number;
}

export async function getSDRDevices(): Promise<SDRDeviceStatus> {
  const response = await fetch(`${API_BASE}/sdr/devices`);
  if (!response.ok) throw new Error('Failed to fetch SDR devices');
  return response.json();
}

import type { ControlChannelEvent } from '../types';

export async function getControlChannelEvents(count?: number): Promise<{ events: ControlChannelEvent[] }> {
  const url = count ? `${API_BASE}/control-channel?count=${count}` : `${API_BASE}/control-channel`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch control channel events');
  return response.json();
}

// RadioReference API functions
export async function getRRStates(): Promise<{ states: RRState[] }> {
  const response = await fetch(`${API_BASE}/rr/states`);
  if (!response.ok) throw new Error('Failed to fetch states');
  return response.json();
}

export async function getRRCounties(stateId: number): Promise<{ counties: RRCounty[] }> {
  const response = await fetch(`${API_BASE}/rr/states/${stateId}/counties`);
  if (!response.ok) throw new Error('Failed to fetch counties');
  return response.json();
}

export async function getRRSystems(params?: {
  state?: number;
  county?: number;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ systems: RRSystem[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.state) searchParams.set('state', params.state.toString());
  if (params?.county) searchParams.set('county', params.county.toString());
  if (params?.type) searchParams.set('type', params.type);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const url = `${API_BASE}/rr/systems${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch systems');
  return response.json();
}

export async function getRRSystem(id: number): Promise<{
  system: RRSystem;
  sites: RRSite[];
  frequencies: RRFrequency[];
  talkgroups: RRTalkgroup[];
  talkgroupCount: number;
}> {
  const response = await fetch(`${API_BASE}/rr/systems/${id}`);
  if (!response.ok) throw new Error('Failed to fetch system');
  return response.json();
}

export async function getRRSites(systemId: number): Promise<{ sites: RRSite[] }> {
  const response = await fetch(`${API_BASE}/rr/systems/${systemId}/sites`);
  if (!response.ok) throw new Error('Failed to fetch sites');
  return response.json();
}

export async function getRRFrequencies(systemId: number): Promise<{ frequencies: RRFrequency[] }> {
  const response = await fetch(`${API_BASE}/rr/systems/${systemId}/frequencies`);
  if (!response.ok) throw new Error('Failed to fetch frequencies');
  return response.json();
}

export async function getRRTalkgroups(
  systemId: number,
  params?: { category?: string; tag?: string; limit?: number; offset?: number }
): Promise<{ talkgroups: RRTalkgroup[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.tag) searchParams.set('tag', params.tag);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const url = `${API_BASE}/rr/systems/${systemId}/talkgroups${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch talkgroups');
  return response.json();
}

export async function searchRR(
  query: string,
  params?: { state?: number; type?: string; limit?: number }
): Promise<RRSearchResult> {
  const searchParams = new URLSearchParams({ q: query });
  if (params?.state) searchParams.set('state', params.state.toString());
  if (params?.type) searchParams.set('type', params.type);
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const response = await fetch(`${API_BASE}/rr/search?${searchParams.toString()}`);
  if (!response.ok) throw new Error('Failed to search');
  return response.json();
}

export async function getSelectedSystems(): Promise<{ systems: RRSystem[] }> {
  const response = await fetch(`${API_BASE}/rr/selected`);
  if (!response.ok) throw new Error('Failed to fetch selected systems');
  return response.json();
}

export async function addSelectedSystem(systemId: number, priority?: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/rr/selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemId, priority }),
  });
  if (!response.ok) throw new Error('Failed to add selected system');
  return response.json();
}

export async function removeSelectedSystem(systemId: number): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/rr/selected/${systemId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to remove selected system');
  return response.json();
}

export async function generateTRConfig(): Promise<{
  config: unknown;
  talkgroupFiles: Record<string, string>;
  centerFrequency: number;
  bandwidth: number;
}> {
  const response = await fetch(`${API_BASE}/rr/generate-config`);
  if (!response.ok) throw new Error('Failed to generate config');
  return response.json();
}

export async function getRRStats(): Promise<{ stats: RRStats }> {
  const response = await fetch(`${API_BASE}/rr/stats`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export async function getRRGeographyCounts(): Promise<{
  byState: Record<number, number>;
  byCounty: Record<number, number>;
}> {
  const response = await fetch(`${API_BASE}/rr/geography-counts`);
  if (!response.ok) throw new Error('Failed to fetch geography counts');
  return response.json();
}

// Control channel scanning
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

export interface SystemScanResult {
  id: number;
  name: string;
  type: string;
  systemId?: string;
  wacn?: string;
  nac?: string;
  hasFrequencies: boolean;
  controlChannelCount: number;
}

export async function getControlChannelsForCounty(countyId: number): Promise<{
  controlChannels: ControlChannelScanResult[];
  systems: SystemScanResult[];
  county: RRCounty;
  total: number;
  uniqueSystems: number;
  totalSystems: number;
}> {
  const response = await fetch(`${API_BASE}/rr/counties/${countyId}/control-channels`);
  if (!response.ok) throw new Error('Failed to fetch control channels');
  return response.json();
}

export async function getControlChannelsForState(stateId: number): Promise<{
  controlChannels: ControlChannelScanResult[];
  systems: SystemScanResult[];
  state: RRState;
  total: number;
  uniqueSystems: number;
  totalSystems: number;
}> {
  const response = await fetch(`${API_BASE}/rr/states/${stateId}/control-channels`);
  if (!response.ok) throw new Error('Failed to fetch control channels');
  return response.json();
}

// Spectrum Recording API functions
export interface SpectrumRecording {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  centerFreq: number;
  sampleRate: number;
  fftSize: number;
  minFreq: number;
  maxFreq: number;
  packetCount: number;
  fileSize: number;
  // Control channel and transmission stats
  controlChannelEvents?: number;
  transmissions?: number;
  uniqueTalkgroups?: number;
}

export interface RecordingStatus {
  isRecording: boolean;
  id?: string;
  progress?: number;
  elapsed?: number;
}

export interface ReplayStatus {
  isReplaying: boolean;
  isPaused: boolean;
  recordingId?: string;
  progress?: number;
  currentPacket?: number;
  totalPackets?: number;
}

export async function getSpectrumRecordings(): Promise<{ recordings: SpectrumRecording[] }> {
  const response = await fetch(`${API_BASE}/spectrum/recordings`);
  if (!response.ok) throw new Error('Failed to fetch recordings');
  return response.json();
}

export async function getSpectrumRecordingStatus(): Promise<RecordingStatus> {
  const response = await fetch(`${API_BASE}/spectrum/recording/status`);
  if (!response.ok) throw new Error('Failed to fetch recording status');
  return response.json();
}

export async function startSpectrumRecording(duration: number, name?: string): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`${API_BASE}/spectrum/recording/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration, name }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start recording');
  }
  return response.json();
}

export async function stopSpectrumRecording(): Promise<{ success: boolean; metadata?: SpectrumRecording }> {
  const response = await fetch(`${API_BASE}/spectrum/recording/stop`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to stop recording');
  return response.json();
}

export async function deleteSpectrumRecording(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/spectrum/recordings/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete recording');
  return response.json();
}

export interface RecordedControlChannelEvent {
  relativeTime: number;
  type: string;
  talkgroup?: number;
  talkgroupTag?: string;
  frequency?: number;
  message: string;
}

export async function getSpectrumRecordingEvents(id: string): Promise<{
  metadata: SpectrumRecording;
  controlChannelEvents: RecordedControlChannelEvent[];
}> {
  const response = await fetch(`${API_BASE}/spectrum/recordings/${id}?includeEvents=true`);
  if (!response.ok) throw new Error('Failed to fetch recording events');
  return response.json();
}

export async function getSpectrumReplayStatus(): Promise<ReplayStatus> {
  const response = await fetch(`${API_BASE}/spectrum/replay/status`);
  if (!response.ok) throw new Error('Failed to fetch replay status');
  return response.json();
}

export async function startSpectrumReplay(recordingId: string, loop = false): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/spectrum/replay/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingId, loop }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start replay');
  }
  return response.json();
}

export async function stopSpectrumReplay(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/spectrum/replay/stop`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to stop replay');
  return response.json();
}

export async function pauseSpectrumReplay(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/spectrum/replay/pause`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to pause replay');
  return response.json();
}

export async function resumeSpectrumReplay(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/spectrum/replay/resume`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to resume replay');
  return response.json();
}

export async function getSpectrumStatus(): Promise<{
  recording: RecordingStatus;
  replay: ReplayStatus;
  recordings: SpectrumRecording[];
}> {
  const response = await fetch(`${API_BASE}/spectrum/status`);
  if (!response.ok) throw new Error('Failed to fetch spectrum status');
  return response.json();
}

// Frequency Scanner API
export interface FrequencyScanResult {
  frequency: number;
  inRange: boolean;
  signalStrength: number | null;
  noiseFloor: number | null;
  snr: number | null;
  hasSignal: boolean;
}

export interface ScanResults {
  timestamp: number;
  centerFreq: number;
  minFreq: number;
  maxFreq: number;
  sampleRate: number;
  results: FrequencyScanResult[];
  inRangeCount: number;
  activeCount: number;
}

export interface ScannerStatus {
  hasData: boolean;
  dataAge: number | null;
  coverage: {
    centerFreq: number;
    minFreq: number;
    maxFreq: number;
    sampleRate: number;
  } | null;
  ready: boolean;
}

export async function getScannerStatus(): Promise<ScannerStatus> {
  const response = await fetch(`${API_BASE}/spectrum/scanner/status`);
  if (!response.ok) throw new Error('Failed to fetch scanner status');
  return response.json();
}

export async function scanFrequencies(frequencies: number[]): Promise<ScanResults> {
  const response = await fetch(`${API_BASE}/spectrum/scanner/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frequencies }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to scan frequencies');
  }
  return response.json();
}

// Active System API
// Re-export ActiveSystemInfo from types
export type { ActiveSystemInfo } from '../types';

export interface ActiveSystemStatus {
  active: boolean;
  system: ActiveSystemInfo | null;
}

export async function getActiveSystem(): Promise<ActiveSystemStatus> {
  const response = await fetch(`${API_BASE}/system/active`);
  if (!response.ok) throw new Error('Failed to fetch active system');
  return response.json();
}

export async function switchToSystem(systemId: number): Promise<{ success: boolean; system: ActiveSystemInfo }> {
  const response = await fetch(`${API_BASE}/system/switch/${systemId}`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to switch system');
  }
  return response.json();
}

export async function stopSystem(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/system/stop`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to stop system');
  return response.json();
}

export async function getSystemStatus(): Promise<{
  running: boolean;
  activeSystem: ActiveSystemInfo | null;
}> {
  const response = await fetch(`${API_BASE}/system/status`);
  if (!response.ok) throw new Error('Failed to fetch system status');
  return response.json();
}

// Avtec Integration API
export interface AvtecConfig {
  targetHost: string;
  targetPort: number;
  enabled: boolean;
}

export interface AvtecStatus {
  enabled: boolean;
  connected: boolean;
  targetHost: string;
  targetPort: number;
  activeCalls: number;
  stats: {
    packetsUdpSent: number;
    packetsTcpSent: number;
    bytesUdpSent: number;
    bytesTcpSent: number;
    udpErrors: number;
    tcpErrors: number;
    callsStarted: number;
    callsEnded: number;
    lastPacketTime: number | null;
    lastConnectionTime: number | null;
    lastError: string | null;
    lastErrorTime: number | null;
  };
  uptime: number;
}

export async function getAvtecStatus(): Promise<AvtecStatus> {
  const response = await fetch(`${API_BASE}/avtec/status`);
  if (!response.ok) throw new Error('Failed to fetch Avtec status');
  return response.json();
}

export async function getAvtecConfig(): Promise<AvtecConfig> {
  const response = await fetch(`${API_BASE}/avtec/config`);
  if (!response.ok) throw new Error('Failed to fetch Avtec config');
  return response.json();
}

export async function updateAvtecConfig(config: Partial<AvtecConfig>): Promise<{ success: boolean; config: AvtecConfig }> {
  const response = await fetch(`${API_BASE}/avtec/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update Avtec config');
  }
  return response.json();
}

export async function resetAvtecStats(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/avtec/reset-stats`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to reset Avtec stats');
  return response.json();
}

// System Config API (for conventional vs trunked)
export async function getSystemConfig(): Promise<SystemConfig> {
  const response = await fetch(`${API_BASE}/system/config`);
  if (!response.ok) throw new Error('Failed to fetch system config');
  return response.json();
}

export async function updateSystemConfig(config: { type?: string; shortName?: string }): Promise<{ success: boolean; config: SystemConfig }> {
  const response = await fetch(`${API_BASE}/system/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update system config');
  }
  return response.json();
}

// Channels API (for conventional systems)
export async function getChannels(): Promise<{ channels: Channel[] }> {
  const response = await fetch(`${API_BASE}/channels`);
  if (!response.ok) throw new Error('Failed to fetch channels');
  return response.json();
}

export async function getChannelByFrequency(frequency: number): Promise<{ channel: Channel }> {
  const response = await fetch(`${API_BASE}/channels/${frequency}`);
  if (!response.ok) throw new Error('Failed to fetch channel');
  return response.json();
}
