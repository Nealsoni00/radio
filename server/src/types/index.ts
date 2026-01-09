export interface Talkgroup {
  id: number;
  alphaTag: string;
  description: string | null;
  groupName: string | null;
  groupTag: string | null;
  mode: string;
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
