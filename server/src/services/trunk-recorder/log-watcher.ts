import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ControlChannelEvent {
  timestamp: Date;
  type: 'grant' | 'update' | 'end' | 'encrypted' | 'out_of_band' | 'no_recorder' | 'decode_rate' | 'system_info' | 'unit';
  talkgroup?: number;
  talkgroupTag?: string;
  frequency?: number;
  recorder?: number;
  tdma?: boolean;
  slot?: number;
  unitId?: number;
  decodeRate?: number;
  systemId?: number;
  wacn?: string;
  nac?: string;
  rfss?: number;
  siteId?: number;
  message: string;
}

export class LogWatcher extends EventEmitter {
  private tailProcess: ChildProcess | null = null;
  private logPath: string;
  private buffer: string = '';

  constructor(logPath: string = '/tmp/trunk-recorder.log') {
    super();
    this.logPath = logPath;
  }

  start(): void {
    if (this.tailProcess) return;

    console.log(`Watching trunk-recorder log: ${this.logPath}`);

    // Use tail -F to follow the log file
    this.tailProcess = spawn('tail', ['-F', '-n', '0', this.logPath]);

    this.tailProcess.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.tailProcess.stderr?.on('data', (data: Buffer) => {
      // Ignore "file truncated" messages from tail
      const msg = data.toString();
      if (!msg.includes('truncated')) {
        console.error('Log watcher error:', msg);
      }
    });

    this.tailProcess.on('close', (code) => {
      console.log(`Log watcher process exited with code ${code}`);
      this.tailProcess = null;
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        const event = this.parseLine(line);
        if (event) {
          this.emit('event', event);
        }
      }
    }
  }

  private parseLine(line: string): ControlChannelEvent | null {
    // Remove ANSI color codes
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');

    // Parse timestamp
    const timestampMatch = cleanLine.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\]/);
    const timestamp = timestampMatch ? new Date(timestampMatch[1]) : new Date();

    // Parse TG and frequency
    const tgMatch = cleanLine.match(/TG:\s*(\d+)/);
    const freqMatch = cleanLine.match(/Freq:\s*([\d.]+)\s*MHz/);
    const talkgroup = tgMatch ? parseInt(tgMatch[1], 10) : undefined;
    const frequency = freqMatch ? Math.round(parseFloat(freqMatch[1]) * 1000000) : undefined;

    // Parse recorder info
    const recorderMatch = cleanLine.match(/Recorder Num \[(\d+)\]/);
    const recorder = recorderMatch ? parseInt(recorderMatch[1], 10) : undefined;

    // Parse TDMA info
    const tdmaMatch = cleanLine.match(/TDMA:\s*(true|false)/);
    const slotMatch = cleanLine.match(/Slot:\s*(\d+)/);
    const tdma = tdmaMatch ? tdmaMatch[1] === 'true' : undefined;
    const slot = slotMatch ? parseInt(slotMatch[1], 10) : undefined;

    // Determine event type
    if (cleanLine.includes('Starting P25 Recorder')) {
      return {
        timestamp,
        type: cleanLine.includes('UPDATE') ? 'update' : 'grant',
        talkgroup,
        frequency,
        recorder,
        tdma,
        slot,
        message: `TG ${talkgroup} granted on ${frequency ? (frequency / 1000000).toFixed(4) : '?'} MHz`,
      };
    }

    if (cleanLine.includes('Stopping P25 Recorder') || cleanLine.includes('Concluding Recorded Call')) {
      return {
        timestamp,
        type: 'end',
        talkgroup,
        frequency,
        recorder,
        message: `TG ${talkgroup} call ended`,
      };
    }

    if (cleanLine.includes('ENCRYPTED')) {
      const srcMatch = cleanLine.match(/src:\s*(\d+)/);
      return {
        timestamp,
        type: 'encrypted',
        talkgroup,
        frequency,
        unitId: srcMatch ? parseInt(srcMatch[1], 10) : undefined,
        message: `TG ${talkgroup} ENCRYPTED`,
      };
    }

    if (cleanLine.includes('no source covering Freq') || cleanLine.includes('Not Recording: no source')) {
      return {
        timestamp,
        type: 'out_of_band',
        talkgroup,
        frequency,
        message: `TG ${talkgroup} on ${frequency ? (frequency / 1000000).toFixed(4) : '?'} MHz (out of band)`,
      };
    }

    if (cleanLine.includes('No Digital Recorders Available')) {
      return {
        timestamp,
        type: 'no_recorder',
        talkgroup,
        frequency,
        message: `TG ${talkgroup} - no recorders available`,
      };
    }

    if (cleanLine.includes('Control Channel Message Decode Rate')) {
      const rateMatch = cleanLine.match(/Decode Rate:\s*(\d+)\/sec/);
      const countMatch = cleanLine.match(/count:\s*(\d+)/);
      return {
        timestamp,
        type: 'decode_rate',
        frequency,
        decodeRate: rateMatch ? parseInt(rateMatch[1], 10) : undefined,
        message: `Decode rate: ${rateMatch?.[1] || '?'}/sec (${countMatch?.[1] || '?'} msgs)`,
      };
    }

    if (cleanLine.includes('Decoding System ID')) {
      const sysIdMatch = cleanLine.match(/System ID\s*(\d+)/);
      const wacnMatch = cleanLine.match(/WACN:\s*([A-F0-9]+)/i);
      const nacMatch = cleanLine.match(/NAC:\s*([A-F0-9]+)/i);
      return {
        timestamp,
        type: 'system_info',
        systemId: sysIdMatch ? parseInt(sysIdMatch[1], 10) : undefined,
        wacn: wacnMatch?.[1],
        nac: nacMatch?.[1],
        message: `System ID ${sysIdMatch?.[1]} WACN:${wacnMatch?.[1]} NAC:${nacMatch?.[1]}`,
      };
    }

    if (cleanLine.includes('Decoding System Site')) {
      const rfssMatch = cleanLine.match(/RFSS:\s*(\d+)/);
      const siteMatch = cleanLine.match(/SITE ID:\s*(\d+)/);
      return {
        timestamp,
        type: 'system_info',
        rfss: rfssMatch ? parseInt(rfssMatch[1], 10) : undefined,
        siteId: siteMatch ? parseInt(siteMatch[1], 10) : undefined,
        message: `Site RFSS:${rfssMatch?.[1]} Site:${siteMatch?.[1]}`,
      };
    }

    if (cleanLine.includes('Unit ID set via Control Channel')) {
      const unitMatch = cleanLine.match(/ext:\s*(\d+)/);
      return {
        timestamp,
        type: 'unit',
        talkgroup,
        unitId: unitMatch ? parseInt(unitMatch[1], 10) : undefined,
        message: `Unit ${unitMatch?.[1]} on TG ${talkgroup}`,
      };
    }

    return null;
  }

  stop(): void {
    if (this.tailProcess) {
      this.tailProcess.kill();
      this.tailProcess = null;
      console.log('Log watcher stopped');
    }
  }

  getRecentEvents(count: number = 50): Promise<ControlChannelEvent[]> {
    return new Promise((resolve, reject) => {
      const events: ControlChannelEvent[] = [];
      const tail = spawn('tail', ['-n', count.toString(), this.logPath]);
      let output = '';

      tail.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      tail.on('close', () => {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const event = this.parseLine(line);
            if (event) {
              events.push(event);
            }
          }
        }
        resolve(events);
      });

      tail.on('error', reject);
    });
  }
}
