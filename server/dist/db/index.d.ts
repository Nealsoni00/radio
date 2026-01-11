import { Database as DatabaseType } from 'better-sqlite3';
import type { CallRow, CallSourceRow, TalkgroupRow, ChannelRow } from '../types/index.js';
export declare const db: DatabaseType;
export declare function initializeDatabase(): void;
export declare function upsertTalkgroup(id: number, alphaTag: string, description: string | null, groupName: string | null, groupTag: string | null, mode?: string): void;
export declare function upsertChannel(frequency: number, alphaTag: string, description?: string | null, groupName?: string | null, groupTag?: string | null, mode?: string, systemType?: string): number;
export declare function getChannelByFrequency(frequency: number): ChannelRow | undefined;
export declare function getChannels(): ChannelRow[];
export declare function getOrCreateChannel(frequency: number, alphaTag?: string, groupName?: string): number;
export declare function insertCall(call: {
    id: string;
    talkgroupId: number;
    frequency: number;
    startTime: number;
    stopTime?: number;
    duration?: number;
    emergency?: boolean;
    encrypted?: boolean;
    audioFile?: string;
    audioType?: string;
    systemType?: 'trunked' | 'conventional';
    channelId?: number;
}): void;
export declare function insertCallSources(callId: string, sources: Array<{
    src: number;
    time: number;
    pos: number;
    emergency: boolean;
    tag: string;
}>): void;
export interface GetCallsOptions {
    limit?: number;
    offset?: number;
    talkgroupId?: number;
    channelId?: number;
    frequency?: number;
    systemType?: 'trunked' | 'conventional';
    since?: number;
    emergency?: boolean;
}
export declare function getCalls(options?: GetCallsOptions): CallRow[];
export declare function getCall(id: string): CallRow | undefined;
export declare function getCallSources(callId: string): CallSourceRow[];
export declare function getTalkgroups(): TalkgroupRow[];
export declare function getTalkgroup(id: number): TalkgroupRow | undefined;
export interface SystemConfigRow {
    key: string;
    value: string;
    updated_at: number;
}
export declare function getSystemConfigValue(key: string): string | null;
export declare function setSystemConfigValue(key: string, value: string): void;
export declare function getAllSystemConfig(): Record<string, string>;
export declare function getSystemType(): string;
export declare function setSystemType(type: string): void;
export declare function getSystemShortName(): string;
export declare function setSystemShortName(name: string): void;
export declare function isConventionalSystemFromDB(): boolean;
//# sourceMappingURL=index.d.ts.map