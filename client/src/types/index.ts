export interface Talkgroup {
  id: number;
  alpha_tag: string;
  description: string | null;
  group_name: string | null;
  group_tag: string | null;
  mode: string;
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

export interface ServerMessage {
  type: 'connected' | 'callStart' | 'callEnd' | 'callsActive' | 'rates' | 'error';
  clientId?: string;
  call?: Partial<Call>;
  calls?: Partial<Call>[];
  rates?: Record<string, { decoderate: number }>;
  error?: string;
}

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'subscribeAll' | 'enableAudio';
  talkgroups?: number[];
  enabled?: boolean;
}
