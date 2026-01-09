// RadioReference Data Types

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

export interface SyncProgress {
  entityType: 'state' | 'county' | 'system' | 'site' | 'talkgroup';
  entityId?: number;
  parentId?: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface SyncOptions {
  states?: string[];
  resume?: boolean;
  systemId?: number;
  full?: boolean;
  delayMs?: number;
}

// Search result types
export interface SystemSearchResult extends RRSystem {
  stateName: string;
  stateAbbrev: string;
  countyName?: string;
  talkgroupCount: number;
  siteCount: number;
}

export interface TalkgroupSearchResult extends RRTalkgroup {
  systemName: string;
  systemType: string;
  stateName: string;
  stateAbbrev: string;
  countyName?: string;
}

export interface SearchResults {
  systems: SystemSearchResult[];
  talkgroups: TalkgroupSearchResult[];
  total: number;
}
