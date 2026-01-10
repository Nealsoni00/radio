import dgram from 'dgram';
import { EventEmitter } from 'events';
import type { AudioPacket } from '../../types/index.js';

export interface AudioReceiverEvents {
  audio: (packet: AudioPacket) => void;
  error: (error: Error) => void;
}

export class AudioReceiver extends EventEmitter {
  private socket: dgram.Socket;
  private isRunning = false;

  constructor(private port: number) {
    super();
    this.socket = dgram.createSocket('udp4');
  }

  private packetCount = 0;
  private lastLogTime = Date.now();

  start(): void {
    if (this.isRunning) return;

    this.socket.on('message', (msg: Buffer, rinfo) => {
      try {
        const packet = this.parsePacket(msg);
        if (packet) {
          this.packetCount++;
          // Log every 100 packets or every 5 seconds
          const now = Date.now();
          if (this.packetCount % 100 === 0 || now - this.lastLogTime > 5000) {
            console.log(`[AudioReceiver] Received ${this.packetCount} packets, latest TG: ${packet.talkgroupId}, size: ${packet.pcmData.length} bytes`);
            this.lastLogTime = now;
          }
          this.emit('audio', packet);
        }
      } catch (err) {
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

  private parsePacket(data: Buffer): AudioPacket | null {
    if (data.length < 4) return null;

    // Debug: log first 100 bytes of first few packets
    if (this.packetCount < 5) {
      console.log(`[AudioReceiver] Raw packet ${this.packetCount}, len=${data.length}, first 100 bytes hex:`, data.slice(0, Math.min(100, data.length)).toString('hex'));
      console.log(`[AudioReceiver] Raw packet ${this.packetCount}, first 50 chars:`, data.slice(0, Math.min(50, data.length)).toString('utf8').replace(/[^\x20-\x7E]/g, '.'));
    }

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

        if (this.packetCount < 5) {
          console.log(`[AudioReceiver] Parsed JSON metadata:`, metadata);
        }

        return {
          talkgroupId: metadata.talkgroup,
          pcmData,
          metadata,
        };
      } catch (e) {
        if (this.packetCount < 5) {
          console.log(`[AudioReceiver] JSON parse failed:`, e);
        }
        // Fall through to TGID-only parsing
      }
    }

    // Check if it starts with a JSON object directly (no length prefix)
    if (data[0] === 0x7B) { // '{'
      try {
        // Find the end of JSON by looking for closing brace followed by binary data
        let jsonEnd = -1;
        let braceCount = 0;
        for (let i = 0; i < Math.min(data.length, 1000); i++) {
          if (data[i] === 0x7B) braceCount++;
          else if (data[i] === 0x7D) {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
        if (jsonEnd > 0) {
          const jsonStr = data.slice(0, jsonEnd).toString('utf8');
          const metadata = JSON.parse(jsonStr);
          const pcmData = data.slice(jsonEnd);

          if (this.packetCount < 5) {
            console.log(`[AudioReceiver] Parsed direct JSON metadata:`, metadata);
          }

          return {
            talkgroupId: metadata.talkgroup || metadata.tgid,
            pcmData,
            metadata,
          };
        }
      } catch (e) {
        if (this.packetCount < 5) {
          console.log(`[AudioReceiver] Direct JSON parse failed:`, e);
        }
      }
    }

    // Assume TGID prefix only
    const talkgroupId = firstUint32;
    const pcmData = data.slice(4);

    if (this.packetCount < 5) {
      console.log(`[AudioReceiver] Falling back to TGID-only parsing, TGID=${talkgroupId}`);
    }

    return { talkgroupId, pcmData };
  }

  stop(): void {
    if (!this.isRunning) return;

    this.socket.close(() => {
      this.isRunning = false;
      console.log('Audio receiver stopped');
    });
  }

  isListening(): boolean {
    return this.isRunning;
  }
}
