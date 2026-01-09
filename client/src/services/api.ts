import type { Call, Talkgroup, CallSource } from '../types';

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
