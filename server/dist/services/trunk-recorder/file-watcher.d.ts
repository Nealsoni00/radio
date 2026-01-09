import { EventEmitter } from 'events';
import type { TRCallEnd } from '../../types/index.js';
export interface FileWatcherEvents {
    call: (call: TRCallEnd, audioPath: string) => void;
    error: (error: Error) => void;
}
export declare class FileWatcher extends EventEmitter {
    private audioDir;
    private watcher;
    private lastActivity;
    constructor(audioDir: string);
    isActive(): boolean;
    isWatching(): boolean;
    start(): void;
    private processJsonFile;
    stop(): void;
}
//# sourceMappingURL=file-watcher.d.ts.map