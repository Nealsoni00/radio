import { EventEmitter } from 'events';
import type { TRCallStart, TRCallEnd } from '../../types/index.js';
export interface StatusClientEvents {
    connected: () => void;
    disconnected: () => void;
    callStart: (call: TRCallStart) => void;
    callEnd: (call: TRCallEnd) => void;
    callsActive: (calls: TRCallStart[]) => void;
    rates: (rates: Record<string, {
        decoderate: number;
        control_channel: number;
    }>) => void;
    error: (error: Error) => void;
}
export declare class TrunkRecorderClient extends EventEmitter {
    private url;
    private ws;
    private reconnectInterval;
    private reconnectTimer;
    private isConnecting;
    constructor(url: string);
    connect(): void;
    private scheduleReconnect;
    private handleMessage;
    disconnect(): void;
    isConnected(): boolean;
}
//# sourceMappingURL=status-client.d.ts.map