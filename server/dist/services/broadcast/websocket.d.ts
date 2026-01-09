import type { Server } from 'http';
import type { Call, AudioPacket, FFTPacket } from '../../types/index.js';
import type { ControlChannelEvent } from '../trunk-recorder/log-watcher.js';
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
    broadcastFFT(packet: FFTPacket): void;
    broadcastControlChannel(event: ControlChannelEvent): void;
    getClientCount(): number;
    private generateClientId;
}
//# sourceMappingURL=websocket.d.ts.map