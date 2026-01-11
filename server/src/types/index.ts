// =============================================================================
// System Configuration Types
// =============================================================================

export type SystemType = 'p25' | 'p25_conventional' | 'conventional' | 'conventionalDMR' | 'conventionalP25';

export interface SystemConfig {
  shortName: string;
  type: SystemType;
  /** For trunked systems - control channel frequencies */
  controlChannels?: number[];
  /** For conventional systems - fixed channel definitions */
  channels?: ConventionalChannel[];
  channelFile?: string;
  talkgroupsFile?: string;
}

export interface ConventionalChannel {
  frequency: number;
  alphaTag: string;
  description?: string;
  groupName?: string;
  groupTag?: string;
  mode?: 'D' | 'A'; // Digital or Analog
  squelch?: number;
}

// =============================================================================
// Database Row Types (snake_case, matching SQLite schema)
// =============================================================================

/** Database row from channels table (for conventional systems) */
export interface ChannelRow {
  id: number;
  frequency: number;
  alpha_tag: string;
  description: string | null;
  group_name: string | null;
  group_tag: string | null;
  mode: string;
  system_type: string;
  created_at: number;
  updated_at: number;
}

/** Database row from talkgroups table */
export interface TalkgroupRow {
  id: number;
  alpha_tag: string;
  description: string | null;
  group_name: string | null;
  group_tag: string | null;
  mode: string;
  created_at: number;
  updated_at: number;
}

/** Database row from calls table with joined talkgroup/channel fields */
export interface CallRow {
  id: string;
  talkgroup_id: number;
  frequency: number;
  start_time: number;
  stop_time: number | null;
  duration: number | null;
  emergency: number; // SQLite boolean (0/1)
  encrypted: number; // SQLite boolean (0/1)
  audio_file: string | null;
  audio_type: string | null;
  system_type: string | null; // 'trunked' or 'conventional'
  channel_id: number | null; // For conventional systems
  created_at: number;
  // Joined fields from talkgroups or channels
  alpha_tag?: string;
  talkgroup_description?: string;
  group_name?: string;
  group_tag?: string;
}

/** Database row from call_sources table */
export interface CallSourceRow {
  id: number;
  call_id: string;
  source_id: number;
  timestamp: number;
  position: number;
  emergency: number; // SQLite boolean (0/1)
  tag: string | null;
  // Joined fields
  unit_tag?: string;
}

// =============================================================================
// Application Types (camelCase, for use in application code)
// =============================================================================

export interface Talkgroup {
  id: number;
  alphaTag: string;
  description: string | null;
  groupName: string | null;
  groupTag: string | null;
  mode: string;
}

/** Channel for conventional systems - frequency-based instead of talkgroup-based */
export interface Channel {
  id: number;
  frequency: number;
  alphaTag: string;
  description: string | null;
  groupName: string | null;
  groupTag: string | null;
  mode: string;
  systemType: string;
}

export interface Call {
  id: string;
  talkgroupId: number;
  frequency: number;
  startTime: number;
  stopTime: number | null;
  duration: number | null;
  emergency: boolean;
  encrypted: boolean;
  audioFile: string | null;
  audioType: string | null;
  systemType?: 'trunked' | 'conventional';
  channelId?: number | null; // For conventional systems
  // Joined fields
  alphaTag?: string;
  groupName?: string;
  groupTag?: string;
}

export interface CallSource {
  id: number;
  callId: string;
  sourceId: number;
  timestamp: number;
  position: number;
  emergency: boolean;
  tag: string | null;
}

export interface TRCallStart {
  id: string;
  freq: number;
  talkgroup: number;
  talkgrouptag: string;
  elapsedTime: number;
}

export interface TRCallEnd {
  id: string;
  freq: number;
  talkgroup: number;
  talkgrouptag: string;
  talkgroupDescription: string;
  talkgroupGroup: string;
  talkgroupTag: string;
  startTime: number;
  stopTime: number;
  length: number;
  emergency: boolean;
  encrypted: boolean;
  filename: string;
  audioType: string;
  freqList: Array<{ freq: number; time: number; pos: number; len: number }>;
  srcList: Array<{ src: number; time: number; pos: number; emergency: boolean; tag: string }>;
}

export interface TRStatusMessage {
  type: 'call_start' | 'call_end' | 'calls_active' | 'rates' | 'systems' | 'recorders';
  call?: TRCallStart | TRCallEnd;
  calls?: TRCallStart[];
  rates?: Record<string, { decoderate: number; control_channel: number }>;
}

export interface AudioPacket {
  talkgroupId: number;
  pcmData: Buffer;
  metadata?: {
    talkgroup: number;
    src: number;
    freq: number;
    short_name: string;
    event: string;
  };
}

export interface FFTPacket {
  sourceIndex: number;
  centerFreq: number;
  sampleRate: number;
  timestamp: number;
  fftSize: number;
  minFreq: number;
  maxFreq: number;
  magnitudes: Float32Array;
}

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'subscribeAll' | 'enableAudio' | 'enableFFT';
  talkgroups?: number[];
  enabled?: boolean;
}

export interface ServerMessage {
  type: 'connected' | 'callStart' | 'callEnd' | 'callsActive' | 'newRecording' | 'rates' | 'fft' | 'error';
  clientId?: string;
  call?: Partial<Call> & { audioUrl?: string };
  calls?: Partial<Call>[];
  rates?: Record<string, { decoderate: number }>;
  error?: string;
}

export interface SDRConfig {
  centerFrequency: number;
  sampleRate: number;
  minFrequency: number;
  maxFrequency: number;
}
