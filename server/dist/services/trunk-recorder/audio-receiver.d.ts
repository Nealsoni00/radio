import { EventEmitter } from 'events';
import type { AudioPacket } from '../../types/index.js';
export interface AudioReceiverEvents {
    audio: (packet: AudioPacket) => void;
    error: (error: Error) => void;
}
export declare class AudioReceiver extends EventEmitter {
    private port;
    private socket;
    private isRunning;
    constructor(port: number);
    private packetCount;
    private lastLogTime;
    start(): void;
    private parsePacket;
    stop(): void;
    isListening(): boolean;
}
//# sourceMappingURL=audio-receiver.d.ts.map