import { Database as DatabaseType } from 'better-sqlite3';
export declare const db: DatabaseType;
export declare function initializeDatabase(): void;
export declare function upsertTalkgroup(id: number, alphaTag: string, description: string | null, groupName: string | null, groupTag: string | null, mode?: string): void;
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
}): void;
export declare function insertCallSources(callId: string, sources: Array<{
    src: number;
    time: number;
    pos: number;
    emergency: boolean;
    tag: string;
}>): void;
export declare function getCalls(options?: {
    limit?: number;
    offset?: number;
    talkgroupId?: number;
    since?: number;
    emergency?: boolean;
}): any[];
export declare function getCall(id: string): any;
export declare function getCallSources(callId: string): any[];
export declare function getTalkgroups(): any[];
export declare function getTalkgroup(id: number): any;
//# sourceMappingURL=index.d.ts.map