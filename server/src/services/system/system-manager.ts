import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import {
  getSystem,
  getFrequencies,
  getTalkgroups,
} from '../../db/radioreference-postgres.js';
import { setSystemType, setSystemShortName } from '../../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Determine the system type config based on RadioReference system type string.
 * Maps RadioReference type names to our internal system types.
 */
function determineSystemTypeFromRR(rrType: string): 'p25' | 'conventional' {
  const typeLower = rrType.toLowerCase();

  // Check for conventional system indicators
  // Uses includes/startsWith for flexibility with variants like "LTR Standard", "EDACS Narrowband"
  if (
    typeLower.includes('conventional') ||
    typeLower.startsWith('ltr') ||
    typeLower.startsWith('edacs') ||
    typeLower === 'passport' ||
    typeLower === 'analog' ||
    typeLower === 'mpt1327' ||
    typeLower === 'idas'
  ) {
    return 'conventional';
  }

  // Default to p25 (trunked) for P25, TETRA, SmartNet, DMR Tier III, etc.
  return 'p25';
}

export interface ActiveSystemInfo {
  id: number;
  name: string;
  shortName: string;
  type: string;
  stateAbbrev: string;
  countyName: string;
  centerFrequency: number;
  bandwidth: number;
  controlChannels: number[];
  modulation: string;
}

interface SystemManagerEvents {
  systemChanged: (system: ActiveSystemInfo | null) => void;
  trunkRecorderRestarted: () => void;
  error: (error: Error) => void;
}

class SystemManager extends EventEmitter {
  private activeSystem: ActiveSystemInfo | null = null;
  private trunkRecorderProcess: ChildProcess | null = null;
  private projectRoot: string;
  private configPath: string;
  private talkgroupsDir: string;

  constructor() {
    super();
    // server/dist/services/system/ -> project root is ../../../../
    this.projectRoot = join(__dirname, '../../../..');
    this.configPath = join(this.projectRoot, 'trunk-recorder/config.json');
    this.talkgroupsDir = join(this.projectRoot, 'trunk-recorder');
  }

  getActiveSystem(): ActiveSystemInfo | null {
    return this.activeSystem;
  }

  async switchToSystem(systemId: number): Promise<ActiveSystemInfo> {
    // Get system details from RadioReference database
    const system = await getSystem(systemId);
    if (!system) {
      throw new Error(`System ${systemId} not found`);
    }

    // Auto-configure system type based on RadioReference system type
    const determinedType = determineSystemTypeFromRR(system.type);
    console.log(`Auto-configuring system type: ${system.type} -> ${determinedType}`);
    setSystemType(determinedType);
    setSystemShortName(system.name.substring(0, 50));

    // Get frequencies for the system
    const frequencies = await getFrequencies(systemId);
    if (!frequencies || frequencies.length === 0) {
      throw new Error(`No frequencies found for system ${systemId}`);
    }

    // Get all control channels (deduplicated - simulcast systems have same freq on multiple sites)
    const controlFreqs = frequencies
      .filter((f: { channelType?: string }) => f.channelType === 'control')
      .map((f: { frequency: number }) => f.frequency);
    const allControlChannels = Array.from(new Set<number>(controlFreqs)).sort((a, b) => a - b);

    if (allControlChannels.length === 0) {
      throw new Error(`No control channels found for system ${systemId}`);
    }

    // RTL-SDR max sample rate is about 2.4 MHz, so we need to pick control channels
    // that fit within that bandwidth. Group control channels by proximity.
    const MAX_BANDWIDTH = 2400000; // 2.4 MHz max for RTL-SDR

    // Find clusters of control channels within MAX_BANDWIDTH
    const clusters: number[][] = [];
    for (let i = 0; i < allControlChannels.length; i++) {
      const cluster: number[] = [allControlChannels[i]];
      for (let j = i + 1; j < allControlChannels.length; j++) {
        if (allControlChannels[j] - allControlChannels[i] <= MAX_BANDWIDTH) {
          cluster.push(allControlChannels[j]);
        } else {
          break;
        }
      }
      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    // Log all found clusters
    console.log(`Found ${clusters.length} frequency clusters:`);
    for (const cluster of clusters) {
      const band = cluster[0] < 800000000 ? '700 MHz' : '800 MHz';
      console.log(`  ${band} band: ${cluster.map(f => (f / 1e6).toFixed(4)).join(', ')} MHz (${cluster.length} channels)`);
    }

    // Get voice channels for scoring clusters (need both control + voice in range)
    const voiceFreqs = frequencies
      .filter((f: { channelType?: string }) => f.channelType === 'voice')
      .map((f: { frequency: number }) => f.frequency);
    const voiceChannels = Array.from(new Set<number>(voiceFreqs)).sort((a, b) => a - b);

    // Score clusters based on: control channels + voice channels in range
    const scoredClusters = clusters.map(cluster => {
      const clusterMin = cluster[0] - MAX_BANDWIDTH / 2;
      const clusterMax = cluster[cluster.length - 1] + MAX_BANDWIDTH / 2;
      const voiceInRange = voiceChannels.filter(f => f >= clusterMin && f <= clusterMax);
      const band = cluster[0] < 800000000 ? '700' : '800';
      return {
        cluster,
        controlCount: cluster.length,
        voiceCount: voiceInRange.length,
        score: cluster.length + voiceInRange.length * 2, // Weight voice higher
        band,
      };
    });

    // Log scored clusters
    console.log('Cluster scores:');
    for (const sc of scoredClusters) {
      console.log(`  ${sc.band} MHz: ${sc.controlCount} control, ${sc.voiceCount} voice, score=${sc.score}`);
    }

    // Select the cluster with highest score (control + voice coverage)
    // For split-band systems, 800 MHz often has better infrastructure coverage
    let bestCluster: number[] = [];
    let selectedInfo = { band: '', score: 0, voiceCount: 0 };

    if (scoredClusters.length > 0) {
      const best = scoredClusters.reduce((a, b) => a.score >= b.score ? a : b);
      bestCluster = best.cluster;
      selectedInfo = { band: best.band, score: best.score, voiceCount: best.voiceCount };
    }

    // Final fallback to any cluster with most control channels
    if (bestCluster.length === 0 && clusters.length > 0) {
      bestCluster = clusters.reduce((a, b) => a.length >= b.length ? a : b);
      selectedInfo = { band: bestCluster[0] < 800000000 ? '700' : '800', score: 0, voiceCount: 0 };
    }

    const controlChannels = bestCluster;
    console.log(`Selected ${controlChannels.length} control channels (${selectedInfo.band} MHz band, ${selectedInfo.voiceCount} voice channels in range)`);

    // Calculate center frequency and bandwidth based on selected control channels
    const minFreq = Math.min(...controlChannels);
    const maxFreq = Math.max(...controlChannels);
    const bandwidth = maxFreq - minFreq;
    const centerFrequency = Math.round((minFreq + maxFreq) / 2);

    // Use 2.4 MHz sample rate - enough for most P25 systems
    const sampleRate = 2400000;

    // Determine modulation based on system flavor
    const modulation = system.flavor?.toLowerCase().includes('phase ii') ? 'qpsk' : 'cqpsk';

    // Generate short name for config
    const shortName = system.name
      .substring(0, 16)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Get talkgroups for the system
    const { talkgroups } = await getTalkgroups({ systemId, limit: 5000 });

    // Generate talkgroups CSV file
    const talkgroupsCsvPath = join(this.talkgroupsDir, `${shortName}-talkgroups.csv`);
    const csvContent = this.generateTalkgroupsCsv(talkgroups || []);
    writeFileSync(talkgroupsCsvPath, csvContent);

    // Generate trunk-recorder config
    const config = {
      ver: 2,
      sources: [
        {
          center: centerFrequency,
          rate: sampleRate,
          error: 0,
          gain: 40,
          ppm: 0,
          digitalRecorders: 4,
          analogRecorders: 0,
          driver: 'osmosdr',
          device: 'rtl=0',
        },
      ],
      systems: [
        {
          shortName,
          type: 'p25',
          talkgroupsFile: `${shortName}-talkgroups.csv`,
          modulation,
          control_channels: controlChannels,
          callLog: true,
          audioArchive: true,
          recordUnknown: true,
          minDuration: 1,
          compressWav: false,
        },
      ],
      captureDir: './audio',
      tempDir: '/tmp/trunk-recorder',
      uploadServer: '',
      callTimeout: 3,
      logLevel: 'info',
      statusServer: 'ws://127.0.0.1:3001',
      audioStreaming: true,
      plugins: [
        {
          library: join(this.projectRoot, 'tr-build/build/libfftstream.so'),
          name: 'FFT Stream',
          enabled: true,
          address: '127.0.0.1',
          port: 9001,
          updateRate: 30,
        },
        {
          library: join(this.projectRoot, 'tr-build/build/libsimplestream.so'),
          name: 'Simple Stream',
          enabled: true,
          streams: [
            {
              TGID: 0,
              address: '127.0.0.1',
              port: 9000,
              sendJSON: true,
              sendCallStart: true,
              sendCallEnd: true,
            },
          ],
        },
      ],
    };

    // Write config file
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    console.log(`Written trunk-recorder config for system: ${system.name}`);

    // Create active system info
    this.activeSystem = {
      id: systemId,
      name: system.name,
      shortName,
      type: system.type,
      stateAbbrev: system.stateAbbrev || '',
      countyName: system.countyName || '',
      centerFrequency,
      bandwidth: sampleRate,
      controlChannels,
      modulation,
    };

    // Emit system changed event
    this.emit('systemChanged', this.activeSystem);

    // Restart trunk-recorder
    await this.restartTrunkRecorder();

    return this.activeSystem;
  }

  private generateTalkgroupsCsv(talkgroups: any[]): string {
    const lines = ['Decimal,Hex,Alpha Tag,Mode,Description,Tag,Category'];
    for (const tg of talkgroups) {
      const decimal = tg.talkgroupId;
      const hex = decimal.toString(16).toUpperCase();
      const alphaTag = (tg.alphaTag || '').replace(/,/g, ' ');
      const mode = tg.mode || 'D';
      const description = (tg.description || '').replace(/,/g, ' ');
      const tag = (tg.tag || '').replace(/,/g, ' ');
      const category = (tg.category || '').replace(/,/g, ' ');
      lines.push(`${decimal},${hex},${alphaTag},${mode},${description},${tag},${category}`);
    }
    return lines.join('\n');
  }

  async restartTrunkRecorder(): Promise<void> {
    // Kill existing trunk-recorder process
    await this.stopTrunkRecorder();

    // Wait a moment for cleanup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Find trunk-recorder binary
    const trBinPaths = [
      join(this.projectRoot, 'tr-build/build/trunk-recorder'),
      '/usr/local/bin/trunk-recorder',
      '/usr/bin/trunk-recorder',
    ];

    let trBin = '';
    for (const path of trBinPaths) {
      if (existsSync(path)) {
        trBin = path;
        break;
      }
    }

    if (!trBin) {
      throw new Error('trunk-recorder binary not found');
    }

    // Start trunk-recorder
    console.log(`Starting trunk-recorder from: ${trBin}`);
    this.trunkRecorderProcess = spawn(trBin, ['--config=config.json'], {
      cwd: join(this.projectRoot, 'trunk-recorder'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Pipe output to log file
    const fs = await import('fs');
    const logStream = fs.createWriteStream('/tmp/trunk-recorder-output.log', { flags: 'a' });
    this.trunkRecorderProcess.stdout?.pipe(logStream);
    this.trunkRecorderProcess.stderr?.pipe(logStream);

    this.trunkRecorderProcess.on('error', (err) => {
      console.error('trunk-recorder process error:', err);
      this.emit('error', err);
    });

    this.trunkRecorderProcess.on('exit', (code, signal) => {
      console.log(`trunk-recorder exited with code ${code}, signal ${signal}`);
      this.trunkRecorderProcess = null;
    });

    // Wait for startup
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify it's running
    if (!this.trunkRecorderProcess || this.trunkRecorderProcess.exitCode !== null) {
      throw new Error('trunk-recorder failed to start');
    }

    console.log('trunk-recorder started successfully');
    this.emit('trunkRecorderRestarted');
  }

  async stopTrunkRecorder(): Promise<void> {
    // Kill by process reference
    if (this.trunkRecorderProcess) {
      this.trunkRecorderProcess.kill('SIGTERM');
      this.trunkRecorderProcess = null;
    }

    // Also kill any other trunk-recorder processes
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync('pkill -f "trunk-recorder.*config"');
    } catch {
      // Process might not exist, that's ok
    }
  }

  isTrunkRecorderRunning(): boolean {
    return this.trunkRecorderProcess !== null && this.trunkRecorderProcess.exitCode === null;
  }
}

// Singleton instance
export const systemManager = new SystemManager();
