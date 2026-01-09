import dgram from 'dgram';
import { EventEmitter } from 'events';

export interface FFTPacket {
  sourceIndex: number;
  centerFreq: number;
  sampleRate: number;
  timestamp: number;
  fftSize: number;
  minFreq: number;
  maxFreq: number;
  magnitudes: Float32Array;
}

export interface FFTReceiverEvents {
  fft: (packet: FFTPacket) => void;
  error: (error: Error) => void;
}

export class FFTReceiver extends EventEmitter {
  private socket: dgram.Socket;
  private isRunning = false;

  // Magic number for packet identification: "FFTD" = 0x46465444
  private readonly MAGIC = 0x46465444;

  constructor(private port: number) {
    super();
    this.socket = dgram.createSocket('udp4');
  }

  start(): void {
    if (this.isRunning) return;

    this.socket.on('message', (msg: Buffer) => {
      try {
        const packet = this.parsePacket(msg);
        if (packet) {
          console.log(`FFT packet received: ${packet.fftSize} bins, ${packet.centerFreq / 1e6} MHz`);
          this.emit('fft', packet);
        }
      } catch (err) {
        console.error('Failed to parse FFT packet:', err);
      }
    });

    this.socket.on('error', (err) => {
      console.error('FFT receiver error:', err);
      this.emit('error', err);
    });

    this.socket.bind(this.port, () => {
      this.isRunning = true;
      console.log(`FFT receiver listening on UDP port ${this.port}`);
    });
  }

  private parsePacket(data: Buffer): FFTPacket | null {
    // Minimum packet size: 12 byte header
    if (data.length < 12) return null;

    // Parse header
    const magic = data.readUInt32LE(0);
    if (magic !== this.MAGIC) {
      // Not an FFT packet
      return null;
    }

    const metadataLength = data.readUInt32LE(4);
    const fftSize = data.readUInt32LE(8);

    // Validate packet size
    const expectedSize = 12 + metadataLength + fftSize * 4;
    if (data.length < expectedSize) {
      console.warn(`FFT packet too small: got ${data.length}, expected ${expectedSize}`);
      return null;
    }

    // Parse metadata JSON
    const metadataJson = data.slice(12, 12 + metadataLength).toString('utf8');
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(metadataJson);
    } catch {
      console.warn('Failed to parse FFT metadata JSON');
      return null;
    }

    // Parse FFT magnitude data (float32 array)
    const fftDataStart = 12 + metadataLength;
    const magnitudes = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      magnitudes[i] = data.readFloatLE(fftDataStart + i * 4);
    }

    return {
      sourceIndex: (metadata.sourceIndex as number) ?? 0,
      centerFreq: (metadata.centerFreq as number) ?? 0,
      sampleRate: (metadata.sampleRate as number) ?? 0,
      timestamp: (metadata.timestamp as number) ?? Date.now(),
      fftSize,
      minFreq: (metadata.minFreq as number) ?? 0,
      maxFreq: (metadata.maxFreq as number) ?? 0,
      magnitudes,
    };
  }

  stop(): void {
    if (!this.isRunning) return;

    this.socket.close(() => {
      this.isRunning = false;
      console.log('FFT receiver stopped');
    });
  }

  isListening(): boolean {
    return this.isRunning;
  }
}
