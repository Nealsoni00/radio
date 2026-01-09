import { EventEmitter } from 'events';
import type { FFTPacket } from '../trunk-recorder/fft-receiver.js';
import type { FFTRecorder, RecordingMetadata } from './fft-recorder.js';

interface RecordedPacket {
  timestamp: number;
  relativeTime: number;
  magnitudes: number[];
}

export class FFTReplayer extends EventEmitter {
  private isReplaying = false;
  private isPaused = false;
  private currentRecordingId: string | null = null;
  private packets: RecordedPacket[] = [];
  private metadata: RecordingMetadata | null = null;
  private currentPacketIndex = 0;
  private replayStartTime = 0;
  private pausedAt = 0;
  private replayTimeout: NodeJS.Timeout | null = null;
  private loop = false;

  constructor(private recorder: FFTRecorder) {
    super();
  }

  /**
   * Start replaying a recording
   * @param recordingId - ID of the recording to replay
   * @param loop - Whether to loop the recording
   */
  startReplay(recordingId: string, loop = false): boolean {
    if (this.isReplaying) {
      this.stopReplay();
    }

    const recording = this.recorder.getRecording(recordingId);
    if (!recording) {
      console.error(`Recording not found: ${recordingId}`);
      return false;
    }

    this.currentRecordingId = recordingId;
    this.packets = recording.packets;
    this.metadata = recording.metadata;
    this.currentPacketIndex = 0;
    this.isReplaying = true;
    this.isPaused = false;
    this.loop = loop;
    this.replayStartTime = Date.now();

    console.log(`Started FFT replay: ${recordingId} (${this.packets.length} packets, ${(this.metadata.duration / 1000).toFixed(1)}s)`);
    this.emit('replayStarted', { id: recordingId, metadata: this.metadata });

    this.scheduleNextPacket();
    return true;
  }

  /**
   * Stop the current replay
   */
  stopReplay(): void {
    if (!this.isReplaying) return;

    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }

    const id = this.currentRecordingId;
    this.isReplaying = false;
    this.isPaused = false;
    this.currentRecordingId = null;
    this.packets = [];
    this.metadata = null;
    this.currentPacketIndex = 0;

    console.log(`Stopped FFT replay: ${id}`);
    this.emit('replayStopped', { id });
  }

  /**
   * Pause the current replay
   */
  pauseReplay(): void {
    if (!this.isReplaying || this.isPaused) return;

    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }

    this.isPaused = true;
    this.pausedAt = Date.now();
    console.log(`Paused FFT replay at packet ${this.currentPacketIndex}`);
    this.emit('replayPaused', { id: this.currentRecordingId });
  }

  /**
   * Resume a paused replay
   */
  resumeReplay(): void {
    if (!this.isReplaying || !this.isPaused) return;

    // Adjust start time to account for pause duration
    const pauseDuration = Date.now() - this.pausedAt;
    this.replayStartTime += pauseDuration;

    this.isPaused = false;
    console.log(`Resumed FFT replay at packet ${this.currentPacketIndex}`);
    this.emit('replayResumed', { id: this.currentRecordingId });

    this.scheduleNextPacket();
  }

  private scheduleNextPacket(): void {
    if (!this.isReplaying || this.isPaused) return;

    if (this.currentPacketIndex >= this.packets.length) {
      if (this.loop) {
        // Restart from beginning
        this.currentPacketIndex = 0;
        this.replayStartTime = Date.now();
        console.log(`Looping FFT replay: ${this.currentRecordingId}`);
        this.emit('replayLooped', { id: this.currentRecordingId });
      } else {
        // Replay complete
        this.stopReplay();
        this.emit('replayComplete', { id: this.currentRecordingId });
        return;
      }
    }

    const packet = this.packets[this.currentPacketIndex];
    const elapsed = Date.now() - this.replayStartTime;
    const delay = Math.max(0, packet.relativeTime - elapsed);

    this.replayTimeout = setTimeout(() => {
      this.emitPacket(packet);
      this.currentPacketIndex++;
      this.scheduleNextPacket();
    }, delay);
  }

  private emitPacket(recordedPacket: RecordedPacket): void {
    if (!this.metadata) return;

    const fftPacket: FFTPacket = {
      sourceIndex: 0,
      centerFreq: this.metadata.centerFreq,
      sampleRate: this.metadata.sampleRate,
      timestamp: Date.now(),
      fftSize: recordedPacket.magnitudes.length,
      minFreq: this.metadata.minFreq,
      maxFreq: this.metadata.maxFreq,
      magnitudes: new Float32Array(recordedPacket.magnitudes),
    };

    this.emit('fft', fftPacket);

    // Emit progress every 30 packets
    if (this.currentPacketIndex % 30 === 0) {
      const progress = this.currentPacketIndex / this.packets.length;
      this.emit('replayProgress', {
        id: this.currentRecordingId,
        progress,
        packetIndex: this.currentPacketIndex,
        totalPackets: this.packets.length,
      });
    }
  }

  isCurrentlyReplaying(): boolean {
    return this.isReplaying;
  }

  isCurrentlyPaused(): boolean {
    return this.isPaused;
  }

  getReplayStatus(): {
    isReplaying: boolean;
    isPaused: boolean;
    recordingId?: string;
    progress?: number;
    currentPacket?: number;
    totalPackets?: number;
  } {
    if (!this.isReplaying) {
      return { isReplaying: false, isPaused: false };
    }

    return {
      isReplaying: true,
      isPaused: this.isPaused,
      recordingId: this.currentRecordingId || undefined,
      progress: this.packets.length > 0 ? this.currentPacketIndex / this.packets.length : 0,
      currentPacket: this.currentPacketIndex,
      totalPackets: this.packets.length,
    };
  }
}
