export interface Talkgroup {
  id: number;
  alpha_tag: string;
  description: string | null;
  group_name: string | null;
  group_tag: string | null;
  mode: string;
}

/** Channel for conventional systems (frequency-based) */
export interface Channel {
  id: number;
  frequency: number;
  alpha_tag: string;
  description: string | null;
  group_name: string | null;
  group_tag: string | null;
  mode: string;
  system_type: string;
}

/** System configuration from server */
export interface SystemConfig {
  type: string;
  shortName: string;
  isConventional: boolean;
}

export interface Call {
  id: string;
  talkgroup_id: number;
  frequency: number;
  start_time: number;
  stop_time: number | null;
  duration: number | null;
  emergency: boolean;
  encrypted: boolean;
  audio_file: string | null;
  audio_type: string | null;
  system_type?: 'trunked' | 'conventional';
  channel_id?: number | null;
  // Joined fields
  alpha_tag?: string;
  talkgroup_description?: string;
  group_name?: string;
  group_tag?: string;
  // UI state
  isActive?: boolean;
}

export interface CallSource {
  id: number;
  call_id: string;
  source_id: number;
  timestamp: number;
  position: number;
  emergency: boolean;
  tag: string | null;
  unit_tag?: string;
}

export interface ControlChannelEvent {
  timestamp: string;
  type: 'grant' | 'update' | 'end' | 'encrypted' | 'out_of_band' | 'no_recorder' | 'decode_rate' | 'system_info' | 'unit';
  talkgroup?: number;
  talkgroupTag?: string;
  frequency?: number;
  recorder?: number;
  tdma?: boolean;
  slot?: number;
  unitId?: number;
  decodeRate?: number;
  systemId?: number;
  wacn?: string;
  nac?: string;
  rfss?: number;
  siteId?: number;
  message: string;
}

export interface ActiveSystemInfo {
  id: number;
  name: string;
  shortName: string;
  type: string;
  stateAbbrev: string;
  countyName: string;
  centerFrequency: number;
  bandwidth: number;
  controlChannels: number[];
  modulation: string;
}

export interface ServerMessage {
  type: 'connected' | 'callStart' | 'callEnd' | 'callsActive' | 'newRecording' | 'controlChannel' | 'rates' | 'systemChanged' | 'error';
  clientId?: string;
  call?: Partial<Call> & { audioUrl?: string; talkgroupId?: number; alphaTag?: string };
  calls?: Partial<Call>[];
  event?: ControlChannelEvent;
  rates?: Record<string, { decoderate: number }>;
  system?: ActiveSystemInfo | null;
  error?: string;
}

export interface SDRConfig {
  centerFrequency: number;
  sampleRate: number;
  minFrequency: number;
  maxFrequency: number;
}

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'subscribeAll' | 'enableAudio' | 'enableFFT';
  talkgroups?: number[];
  enabled?: boolean;
}

export interface FFTData {
  sourceIndex: number;
  centerFreq: number;
  sampleRate: number;
  timestamp: number;
  fftSize: number;
  minFreq: number;
  maxFreq: number;
  magnitudes: Float32Array;
}

// RadioReference types
export interface RRState {
  id: number;
  name: string;
  abbreviation: string;
  countryId: number;
}

export interface RRCounty {
  id: number;
  stateId: number;
  name: string;
}

export interface RRSystem {
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
  stateName?: string;
  stateAbbrev?: string;
  countyName?: string;
  talkgroupCount?: number;
  siteCount?: number;
}

export interface RRSite {
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
}

export interface RRFrequency {
  siteId: number;
  systemId: number;
  frequency: number;
  channelType: 'control' | 'alternate' | 'voice';
  lcn?: number;
  isPrimary: boolean;
  siteName?: string;
}

export interface RRTalkgroup {
  systemId: number;
  talkgroupId: number;
  alphaTag?: string;
  description?: string;
  mode?: string;
  category?: string;
  tag?: string;
}

export interface RRSearchResult {
  systems: RRSystem[];
  talkgroups: (RRTalkgroup & {
    systemName: string;
    systemType: string;
    stateName: string;
    stateAbbrev: string;
    countyName?: string;
  })[];
  total: number;
}

export interface RRStats {
  totalSystems: number;
  totalTalkgroups: number;
  totalSites: number;
  p25Systems: number;
}
