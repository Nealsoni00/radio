import { watch, type FSWatcher } from 'chokidar';
import { readFile } from 'fs/promises';
import { basename, dirname, extname } from 'path';
import { EventEmitter } from 'events';
import type { TRCallEnd } from '../../types/index.js';

export interface FileWatcherEvents {
  call: (call: TRCallEnd, audioPath: string) => void;
  error: (error: Error) => void;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private lastActivity: number = 0;

  constructor(private audioDir: string) {
    super();
  }

  isActive(): boolean {
    // Consider active if we've seen a recording in the last 60 seconds
    return this.watcher !== null && (Date.now() - this.lastActivity) < 60000;
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  start(): void {
    console.log(`Watching for audio files in ${this.audioDir}`);

    this.watcher = watch(`${this.audioDir}/**/*.json`, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', async (jsonPath: string) => {
      try {
        this.lastActivity = Date.now();
        await this.processJsonFile(jsonPath);
      } catch (err) {
        console.error(`Failed to process ${jsonPath}:`, err);
        this.emit('error', err as Error);
      }
    });

    this.watcher.on('error', (err) => {
      console.error('File watcher error:', err);
      this.emit('error', err);
    });
  }

  private async processJsonFile(jsonPath: string): Promise<void> {
    const content = await readFile(jsonPath, 'utf8');
    const metadata = JSON.parse(content);

    // Derive audio file path from JSON path
    const dir = dirname(jsonPath);
    const base = basename(jsonPath, '.json');
    const audioPath = `${dir}/${base}.wav`;

    // Transform metadata to TRCallEnd format
    const call: TRCallEnd = {
      id: `${metadata.talkgroup}-${metadata.start_time}`,
      freq: metadata.freq,
      talkgroup: metadata.talkgroup,
      talkgrouptag: metadata.talkgroup_tag || `TG ${metadata.talkgroup}`,
      talkgroupDescription: metadata.talkgroup_description || '',
      talkgroupGroup: metadata.talkgroup_group || '',
      talkgroupTag: metadata.talkgroup_group_tag || '',
      startTime: metadata.start_time,
      stopTime: metadata.stop_time,
      length: metadata.call_length || (metadata.stop_time - metadata.start_time),
      emergency: metadata.emergency || false,
      encrypted: metadata.encrypted || false,
      filename: audioPath,
      audioType: metadata.audio_type || 'digital',
      freqList: metadata.freqList || [],
      srcList: metadata.srcList || [],
    };

    this.emit('call', call, audioPath);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('File watcher stopped');
    }
  }
}
