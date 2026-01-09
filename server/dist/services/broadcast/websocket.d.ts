import type { Server } from 'http';
import type { Call, AudioPacket } from '../../types/index.js';
export declare class BroadcastServer {
    private wss;
    private clients;
    constructor(server: Server);
    private setupHandlers;
    private handleClientMessage;
    private sendToClient;
    private isSubscribed;
    broadcastCallStart(call: Partial<Call>): void;
    broadcastCallEnd(call: Partial<Call>): void;
    broadcastNewRecording(call: Partial<Call> & {
        audioUrl?: string;
    }): void;
    broadcastActiveCalls(calls: Partial<Call>[]): void;
    broadcastRates(rates: Record<string, {
        decoderate: number;
    }>): void;
    broadcastAudio(packet: AudioPacket): void;
    getClientCount(): number;
    private generateClientId;
}
//# sourceMappingURL=websocket.d.ts.map