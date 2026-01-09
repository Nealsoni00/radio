import { EventEmitter } from 'events';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../../config/index.js';
import type { FFTPacket } from '../trunk-recorder/fft-receiver.js';
import type { ControlChannelEvent } from '../trunk-recorder/log-watcher.js';

export interface RecordingMetadata {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  centerFreq: number;
  sampleRate: number;
  fftSize: number;
  minFreq: number;
  maxFreq: number;
  packetCount: number;
  fileSize: number;
  // Control channel and transmission stats
  controlChannelEvents: number;
  transmissions: number;
  uniqueTalkgroups: number;
}

interface RecordedPacket {
  timestamp: number;
  relativeTime: number;
  magnitudes: number[];
}

interface RecordedControlChannelEvent {
  relativeTime: number;
  type: string;
  talkgroup?: number;
  talkgroupTag?: string;
  frequency?: number;
  message: string;
}

interface RecordingFile {
  metadata: RecordingMetadata;
  packets: RecordedPacket[];
  controlChannelEvents: RecordedControlChannelEvent[];
}

export class FFTRecorder extends EventEmitter {
  private isRecording = false;
  private recordingStartTime = 0;
  private recordingDuration = 0;
  private recordingTimeout: NodeJS.Timeout | null = null;
  private packets: RecordedPacket[] = [];
  private controlChannelEvents: RecordedControlChannelEvent[] = [];
  private transmissionCount = 0;
  private talkgroupsSeen: Set<number> = new Set();
  private currentMetadata: Partial<RecordingMetadata> = {};
  private recordingsDir: string;

  constructor() {
    super();
    this.recordingsDir = join(dirname(config.database.path), 'recordings');
    this.ensureRecordingsDir();
  }

  private ensureRecordingsDir(): void {
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  /**
   * Start recording FFT data for a specified duration
   * @param durationSeconds - Duration to record in seconds
   * @param name - Optional name for the recording
   */
  startRecording(durationSeconds: number, name?: string): string {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    const recordingId = `fft_${Date.now()}`;
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.recordingDuration = durationSeconds * 1000;
    this.packets = [];
    this.controlChannelEvents = [];
    this.transmissionCount = 0;
    this.talkgroupsSeen = new Set();
    this.currentMetadata = {
      id: recordingId,
      name: name || `Recording ${new Date().toLocaleString()}`,
      startTime: this.recordingStartTime,
    };

    console.log(`Started FFT recording: ${recordingId} for ${durationSeconds}s`);
    this.emit('recordingStarted', { id: recordingId, duration: durationSeconds });

    // Set timeout to stop recording
    this.recordingTimeout = setTimeout(() => {
      this.stopRecording();
    }, this.recordingDuration);

    return recordingId;
  }

  /**
   * Stop the current recording and save to file
   */
  stopRecording(): RecordingMetadata | null {
    if (!this.isRecording) {
      return null;
    }

    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }

    this.isRecording = false;
    const endTime = Date.now();

    if (this.packets.length === 0) {
      console.log('No packets recorded, discarding recording');
      this.emit('recordingStopped', { id: this.currentMetadata.id, success: false });
      return null;
    }

    // Complete metadata
    const metadata: RecordingMetadata = {
      id: this.currentMetadata.id!,
      name: this.currentMetadata.name!,
      startTime: this.recordingStartTime,
      endTime,
      duration: endTime - this.recordingStartTime,
      centerFreq: this.currentMetadata.centerFreq || 0,
      sampleRate: this.currentMetadata.sampleRate || 0,
      fftSize: this.currentMetadata.fftSize || 0,
      minFreq: this.currentMetadata.minFreq || 0,
      maxFreq: this.currentMetadata.maxFreq || 0,
      packetCount: this.packets.length,
      fileSize: 0,
      controlChannelEvents: this.controlChannelEvents.length,
      transmissions: this.transmissionCount,
      uniqueTalkgroups: this.talkgroupsSeen.size,
    };

    // Save to file - calculate size first, then include in metadata
    const tempRecording = {
      metadata: { ...metadata, fileSize: 0 },
      packets: this.packets,
      controlChannelEvents: this.controlChannelEvents,
    };
    // Estimate size by serializing without metadata.fileSize
    const estimatedSize = JSON.stringify(tempRecording).length;
    metadata.fileSize = estimatedSize;

    const recording: RecordingFile = {
      metadata,
      packets: this.packets,
      controlChannelEvents: this.controlChannelEvents,
    };

    const filePath = join(this.recordingsDir, `${metadata.id}.json`);
    const jsonData = JSON.stringify(recording);
    writeFileSync(filePath, jsonData);

    console.log(`FFT recording saved: ${filePath} (${this.packets.length} packets, ${(metadata.fileSize / 1024).toFixed(1)} KB)`);
    this.emit('recordingStopped', { id: metadata.id, success: true, metadata });

    this.packets = [];
    return metadata;
  }

  /**
   * Add an FFT packet to the current recording
   */
  addPacket(packet: FFTPacket): void {
    if (!this.isRecording) return;

    const relativeTime = Date.now() - this.recordingStartTime;

    // Update metadata from first packet
    if (this.packets.length === 0) {
      this.currentMetadata.centerFreq = packet.centerFreq;
      this.currentMetadata.sampleRate = packet.sampleRate;
      this.currentMetadata.fftSize = packet.fftSize;
      this.currentMetadata.minFreq = packet.minFreq;
      this.currentMetadata.maxFreq = packet.maxFreq;
    }

    this.packets.push({
      timestamp: packet.timestamp,
      relativeTime,
      magnitudes: Array.from(packet.magnitudes),
    });

    // Emit progress every 30 packets (~1 second)
    if (this.packets.length % 30 === 0) {
      const progress = relativeTime / this.recordingDuration;
      this.emit('recordingProgress', {
        id: this.currentMetadata.id,
        progress: Math.min(progress, 1),
        packetCount: this.packets.length,
        elapsed: relativeTime,
      });
    }
  }

  /**
   * Add a control channel event to the current recording
   */
  addControlChannelEvent(event: ControlChannelEvent): void {
    if (!this.isRecording) return;

    const relativeTime = Date.now() - this.recordingStartTime;

    // Track talkgroups and transmissions
    if (event.talkgroup) {
      this.talkgroupsSeen.add(event.talkgroup);
    }
    if (event.type === 'grant') {
      this.transmissionCount++;
    }

    this.controlChannelEvents.push({
      relativeTime,
      type: event.type,
      talkgroup: event.talkgroup,
      talkgroupTag: event.talkgroupTag,
      frequency: event.frequency,
      message: event.message,
    });
  }

  /**
   * Get list of all recordings
   */
  getRecordings(): RecordingMetadata[] {
    const files = readdirSync(this.recordingsDir).filter((f) => f.endsWith('.json'));
    const recordings: RecordingMetadata[] = [];

    for (const file of files) {
      try {
        const data = readFileSync(join(this.recordingsDir, file), 'utf-8');
        const recording: RecordingFile = JSON.parse(data);
        recordings.push(recording.metadata);
      } catch (err) {
        console.error(`Failed to read recording ${file}:`, err);
      }
    }

    return recordings.sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Get a specific recording by ID
   */
  getRecording(id: string): RecordingFile | null {
    const filePath = join(this.recordingsDir, `${id}.json`);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error(`Failed to read recording ${id}:`, err);
      return null;
    }
  }

  /**
   * Delete a recording
   */
  deleteRecording(id: string): boolean {
    const filePath = join(this.recordingsDir, `${id}.json`);
    if (!existsSync(filePath)) {
      return false;
    }

    try {
      unlinkSync(filePath);
      console.log(`Deleted recording: ${id}`);
      return true;
    } catch (err) {
      console.error(`Failed to delete recording ${id}:`, err);
      return false;
    }
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  getRecordingStatus(): { isRecording: boolean; id?: string; progress?: number; elapsed?: number } {
    if (!this.isRecording) {
      return { isRecording: false };
    }

    const elapsed = Date.now() - this.recordingStartTime;
    return {
      isRecording: true,
      id: this.currentMetadata.id,
      progress: Math.min(elapsed / this.recordingDuration, 1),
      elapsed,
    };
  }
}
