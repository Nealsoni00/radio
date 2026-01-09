import dgram from 'dgram';
import { EventEmitter } from 'events';
export class AudioReceiver extends EventEmitter {
    port;
    socket;
    isRunning = false;
    constructor(port) {
        super();
        this.port = port;
        this.socket = dgram.createSocket('udp4');
    }
    start() {
        if (this.isRunning)
            return;
        this.socket.on('message', (msg, rinfo) => {
            try {
                const packet = this.parsePacket(msg);
                if (packet) {
                    this.emit('audio', packet);
                }
            }
            catch (err) {
                console.error('Failed to parse audio packet:', err);
            }
        });
        this.socket.on('error', (err) => {
            console.error('Audio receiver error:', err);
            this.emit('error', err);
        });
        this.socket.bind(this.port, () => {
            this.isRunning = true;
            console.log(`Audio receiver listening on UDP port ${this.port}`);
        });
    }
    parsePacket(data) {
        if (data.length < 4)
            return null;
        // trunk-recorder SimpleStream format with sendJSON=true:
        // [4 bytes JSON length (little-endian)][JSON metadata][PCM audio data]
        //
        // With sendTGID=true only:
        // [4 bytes TGID (little-endian)][PCM audio data]
        const firstUint32 = data.readUInt32LE(0);
        // Heuristic: if the value is small (< 10000), it's likely JSON length
        // Talkgroup IDs in the RWC system are typically larger numbers
        if (firstUint32 > 0 && firstUint32 < 10000 && firstUint32 < data.length) {
            // Likely JSON metadata prefix
            try {
                const jsonStr = data.slice(4, 4 + firstUint32).toString('utf8');
                const metadata = JSON.parse(jsonStr);
                const pcmData = data.slice(4 + firstUint32);
                return {
                    talkgroupId: metadata.talkgroup,
                    pcmData,
                    metadata,
                };
            }
            catch {
                // Fall through to TGID-only parsing
            }
        }
        // Assume TGID prefix only
        const talkgroupId = firstUint32;
        const pcmData = data.slice(4);
        return { talkgroupId, pcmData };
    }
    stop() {
        if (!this.isRunning)
            return;
        this.socket.close(() => {
            this.isRunning = false;
            console.log('Audio receiver stopped');
        });
    }
    isListening() {
        return this.isRunning;
    }
}
//# sourceMappingURL=audio-receiver.js.map