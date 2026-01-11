/**
 * Avtec Streamer Service
 *
 * Streams radio traffic from trunk-recorder to an Avtec-compatible receiver
 * (like the Prepared911 audio-client).
 *
 * This service:
 * 1. Listens for callStart/callEnd events from the trunk-recorder status server
 * 2. Receives live audio from the audio receiver
 * 3. Converts to Avtec format and sends via TCP (metadata) and UDP (audio)
 */

import { Socket, createConnection } from 'net';
import { createSocket, Socket as UdpSocket } from 'dgram';
import { EventEmitter } from 'events';
import {
  createEndpointInfoPacket,
  createEndpointUpdatePacket,
  createRTPPacket,
  pcmToMulaw,
  RTP_PAYLOAD_TYPE_PCMU,
  AUDIO_DIRECTION_INCOMING,
} from './avtec-protocol.js';

export interface AvtecStreamerConfig {
  targetHost: string;
  targetPort: number;
  enabled: boolean;
}

export interface AvtecStreamerStatus {
  enabled: boolean;
  connected: boolean;
  targetHost: string;
  targetPort: number;
  activeCalls: number;
  stats: {
    packetsUdpSent: number;
    packetsTcpSent: number;
    bytesUdpSent: number;
    bytesTcpSent: number;
    udpErrors: number;
    tcpErrors: number;
    callsStarted: number;
    callsEnded: number;
    lastPacketTime: number | null;
    lastConnectionTime: number | null;
    lastError: string | null;
    lastErrorTime: number | null;
  };
  uptime: number;
}

interface ActiveCall {
  sessionId: number;
  ssrc: number;
  sequenceNumber: number;
  rtpSequence: number;
  rtpTimestamp: number;
  talkgroupId: number;
  alphaTag: string;
  startTime: number;
  lastAudioTime: number;
}

export class AvtecStreamer extends EventEmitter {
  private config: AvtecStreamerConfig;
  private tcpSocket: Socket | null = null;
  private udpSocket: UdpSocket | null = null;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private sessionIdCounter = 1;
  private connected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private startTime: number | null = null;
  private static readonly CALL_TIMEOUT_MS = 10000; // Cleanup calls after 10s of no audio
  private stats = {
    packetsUdpSent: 0,
    packetsTcpSent: 0,
    bytesUdpSent: 0,
    bytesTcpSent: 0,
    udpErrors: 0,
    tcpErrors: 0,
    callsStarted: 0,
    callsEnded: 0,
    lastPacketTime: null as number | null,
    lastConnectionTime: null as number | null,
    lastError: null as string | null,
    lastErrorTime: null as number | null,
  };

  constructor(config: Partial<AvtecStreamerConfig> = {}) {
    super();
    this.config = {
      targetHost: config.targetHost || '127.0.0.1',
      targetPort: config.targetPort || 50911,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): AvtecStreamerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect for host/port changes)
   */
  async updateConfig(newConfig: Partial<AvtecStreamerConfig>): Promise<void> {
    const wasEnabled = this.config.enabled;
    const hostChanged = newConfig.targetHost !== undefined && newConfig.targetHost !== this.config.targetHost;
    const portChanged = newConfig.targetPort !== undefined && newConfig.targetPort !== this.config.targetPort;

    // Update config
    if (newConfig.targetHost !== undefined) this.config.targetHost = newConfig.targetHost;
    if (newConfig.targetPort !== undefined) this.config.targetPort = newConfig.targetPort;
    if (newConfig.enabled !== undefined) this.config.enabled = newConfig.enabled;

    // Handle enable/disable
    if (!wasEnabled && this.config.enabled) {
      // Was disabled, now enabled - start
      await this.start();
    } else if (wasEnabled && !this.config.enabled) {
      // Was enabled, now disabled - stop
      this.stop();
    } else if (this.config.enabled && (hostChanged || portChanged)) {
      // Config changed while enabled - restart connection
      this.stop();
      await this.start();
    }

    this.emit('configChanged', this.config);
  }

  /**
   * Get current status including stats
   */
  getStatus(): AvtecStreamerStatus {
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      targetHost: this.config.targetHost,
      targetPort: this.config.targetPort,
      activeCalls: this.activeCalls.size,
      stats: { ...this.stats },
      uptime: this.startTime ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Start the Avtec streamer
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[AvtecStreamer] Disabled, not starting');
      return;
    }

    this.startTime = Date.now();
    console.log(`[AvtecStreamer] Starting - connecting to ${this.config.targetHost}:${this.config.targetPort}`);

    // Create UDP socket for audio
    this.udpSocket = createSocket('udp4');
    this.udpSocket.on('error', (err) => {
      console.error('[AvtecStreamer] UDP socket error:', err);
      this.stats.udpErrors++;
      this.stats.lastError = `UDP: ${err.message}`;
      this.stats.lastErrorTime = Date.now();
    });

    // Connect TCP socket for metadata
    await this.connectTcp();

    // Start cleanup interval for stale calls
    this.cleanupInterval = setInterval(() => this.cleanupStaleCalls(), 5000);
  }

  /**
   * Clean up calls that haven't received audio recently
   */
  private cleanupStaleCalls(): void {
    const now = Date.now();
    const staleCalls: string[] = [];

    for (const [callId, call] of this.activeCalls.entries()) {
      if (now - call.lastAudioTime > AvtecStreamer.CALL_TIMEOUT_MS) {
        staleCalls.push(callId);
      }
    }

    for (const callId of staleCalls) {
      const call = this.activeCalls.get(callId);
      if (call) {
        console.log(`[AvtecStreamer] Call timed out (no audio for ${AvtecStreamer.CALL_TIMEOUT_MS / 1000}s): ${callId} TG:${call.talkgroupId}`);
        this.activeCalls.delete(callId);
        this.stats.callsEnded++;
      }
    }
  }

  /**
   * Connect/reconnect TCP socket
   */
  private async connectTcp(): Promise<void> {
    if (this.tcpSocket) {
      this.tcpSocket.destroy();
      this.tcpSocket = null;
    }

    return new Promise((resolve) => {
      console.log(`[AvtecStreamer] Connecting TCP to ${this.config.targetHost}:${this.config.targetPort}`);

      this.tcpSocket = createConnection(
        {
          host: this.config.targetHost,
          port: this.config.targetPort,
        },
        () => {
          console.log('[AvtecStreamer] TCP connected');
          this.connected = true;
          this.stats.lastConnectionTime = Date.now();
          // Clear the connection timeout - we're connected now
          // Setting to 0 disables the idle timeout
          this.tcpSocket?.setTimeout(0);
          this.emit('connected');
          resolve();
        }
      );

      this.tcpSocket.on('error', (err) => {
        console.error('[AvtecStreamer] TCP error:', err.message);
        this.connected = false;
        this.stats.tcpErrors++;
        this.stats.lastError = `TCP: ${err.message}`;
        this.stats.lastErrorTime = Date.now();
        this.scheduleReconnect();
      });

      this.tcpSocket.on('close', () => {
        console.log('[AvtecStreamer] TCP connection closed');
        this.connected = false;
        this.scheduleReconnect();
      });

      // Set a connection timeout
      this.tcpSocket.setTimeout(5000, () => {
        console.error('[AvtecStreamer] TCP connection timeout');
        this.tcpSocket?.destroy();
        this.connected = false;
        this.scheduleReconnect();
        resolve();
      });
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      if (!this.connected && this.config.enabled) {
        console.log('[AvtecStreamer] Attempting to reconnect...');
        await this.connectTcp();
      }
    }, 5000);
  }

  /**
   * Handle call start event from trunk-recorder
   */
  handleCallStart(call: {
    id: string;
    talkgroupId: number;
    alphaTag?: string;
    frequency: number;
    startTime: number;
    emergency?: boolean;
  }): void {
    if (!this.config.enabled) return;

    // Use the same value for both sessionId and SSRC so audio-client can correlate metadata with audio
    const ssrc = this.generateSSRC(call.talkgroupId, call.startTime);
    const sessionId = ssrc; // Session ID must match SSRC for proper correlation

    const activeCall: ActiveCall = {
      sessionId,
      ssrc,
      sequenceNumber: 0,
      rtpSequence: 0,
      rtpTimestamp: 0,
      talkgroupId: call.talkgroupId,
      alphaTag: call.alphaTag || `TG ${call.talkgroupId}`,
      startTime: call.startTime,
      lastAudioTime: Date.now(),
    };

    this.activeCalls.set(call.id, activeCall);

    // Send metadata packet
    const packet = createEndpointInfoPacket(
      sessionId,
      activeCall.sequenceNumber++,
      activeCall.alphaTag,
      String(call.talkgroupId), // ANI = talkgroup ID for trunk-recorder
      AUDIO_DIRECTION_INCOMING,
      String(call.talkgroupId),
      call.emergency || false
    );

    this.sendMetadata(packet);
    this.stats.callsStarted++;

    console.log(
      `[AvtecStreamer] Call started: ${call.id} TG:${call.talkgroupId} (${activeCall.alphaTag}) sessionId:${sessionId} ssrc:${ssrc}`
    );
  }

  /**
   * Handle call end event from trunk-recorder
   */
  handleCallEnd(callId: string, talkgroupId?: number): void {
    if (!this.config.enabled) return;

    // First try exact match by call ID
    let activeCall = this.activeCalls.get(callId);
    let foundCallId = callId;

    // If not found by exact ID, try to find by talkgroup ID
    if (!activeCall && talkgroupId !== undefined) {
      for (const [id, call] of this.activeCalls.entries()) {
        if (call.talkgroupId === talkgroupId) {
          activeCall = call;
          foundCallId = id;
          break;
        }
      }
    }

    // If still not found, try to extract talkgroup from the call ID (format: tg-timestamp or auto-tg-timestamp)
    if (!activeCall) {
      const parts = callId.split('-');
      let extractedTg: number | undefined;

      if (parts[0] === 'auto' && parts.length >= 2) {
        extractedTg = parseInt(parts[1], 10);
      } else if (parts.length >= 1) {
        extractedTg = parseInt(parts[0], 10);
      }

      if (extractedTg && !isNaN(extractedTg)) {
        for (const [id, call] of this.activeCalls.entries()) {
          if (call.talkgroupId === extractedTg) {
            activeCall = call;
            foundCallId = id;
            break;
          }
        }
      }
    }

    if (!activeCall) {
      return;
    }

    // Send update packet indicating call end (optional, some receivers don't need this)
    // The call will naturally end when audio stops

    this.activeCalls.delete(foundCallId);
    this.stats.callsEnded++;

    console.log(`[AvtecStreamer] Call ended: ${foundCallId} TG:${activeCall.talkgroupId}`);
  }

  /**
   * Handle audio packet from trunk-recorder
   * @param talkgroupId The talkgroup ID
   * @param pcmData 16-bit signed PCM audio data at 8000 Hz
   */
  handleAudioPacket(talkgroupId: number, pcmData: Buffer): void {
    if (!this.config.enabled || !this.udpSocket) return;

    // Find active call for this talkgroup
    let activeCall: ActiveCall | undefined;
    for (const call of this.activeCalls.values()) {
      if (call.talkgroupId === talkgroupId) {
        activeCall = call;
        break;
      }
    }

    if (!activeCall) {
      // No active call for this talkgroup - create one on the fly
      const callId = `auto-${talkgroupId}-${Date.now()}`;
      this.handleCallStart({
        id: callId,
        talkgroupId,
        startTime: Math.floor(Date.now() / 1000),
        frequency: 0,
      });
      activeCall = this.activeCalls.get(callId);
      if (!activeCall) return;
    }

    // Update last audio time to keep the call alive
    activeCall.lastAudioTime = Date.now();

    // Convert PCM to μ-law (G.711)
    // Debug: log input PCM size on first packet
    if (activeCall.rtpSequence === 0) {
      console.log(`[AvtecStreamer] First audio packet TG:${talkgroupId} - PCM input: ${pcmData.length} bytes`);
    }
    const mulawData = pcmToMulaw(pcmData);
    if (activeCall.rtpSequence === 0) {
      console.log(`[AvtecStreamer] First audio packet TG:${talkgroupId} - μ-law output: ${mulawData.length} bytes`);
    }

    // Create RTP packet
    const rtpPacket = createRTPPacket(
      activeCall.rtpSequence++,
      activeCall.rtpTimestamp,
      activeCall.ssrc,
      mulawData,
      RTP_PAYLOAD_TYPE_PCMU,
      activeCall.rtpSequence === 1 // Marker bit on first packet
    );

    // Update timestamp (8000 samples/sec for G.711)
    activeCall.rtpTimestamp += mulawData.length;

    // Send via UDP
    // Log every 100th packet to avoid spam
    if (activeCall.rtpSequence % 100 === 1) {
      console.log(`[AvtecStreamer] Sending UDP audio TG:${talkgroupId} seq:${activeCall.rtpSequence} ssrc:${activeCall.ssrc} size:${rtpPacket.length}bytes`);
    }
    this.udpSocket.send(rtpPacket, this.config.targetPort, this.config.targetHost, (err) => {
      if (err) {
        console.error('[AvtecStreamer] UDP send error:', err);
        this.stats.udpErrors++;
        this.stats.lastError = `UDP send: ${err.message}`;
        this.stats.lastErrorTime = Date.now();
      } else {
        this.stats.packetsUdpSent++;
        this.stats.bytesUdpSent += rtpPacket.length;
        this.stats.lastPacketTime = Date.now();
      }
    });
  }

  /**
   * Send metadata packet via TCP
   */
  private sendMetadata(packet: Buffer): void {
    if (!this.tcpSocket || !this.connected) {
      console.warn('[AvtecStreamer] TCP not connected, cannot send metadata');
      return;
    }

    this.tcpSocket.write(packet, (err) => {
      if (err) {
        console.error('[AvtecStreamer] TCP write error:', err);
        this.stats.tcpErrors++;
        this.stats.lastError = `TCP write: ${err.message}`;
        this.stats.lastErrorTime = Date.now();
      } else {
        this.stats.packetsTcpSent++;
        this.stats.bytesTcpSent += packet.length;
      }
    });
  }

  /**
   * Generate a unique SSRC for a call
   */
  private generateSSRC(talkgroupId: number, startTime: number): number {
    // Use a combination of talkgroup ID and timestamp to generate unique SSRC
    return ((talkgroupId & 0xffff) << 16) | (startTime & 0xffff);
  }

  /**
   * Stop the Avtec streamer
   */
  stop(): void {
    console.log('[AvtecStreamer] Stopping');

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.tcpSocket) {
      this.tcpSocket.destroy();
      this.tcpSocket = null;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    this.connected = false;
    this.activeCalls.clear();
    this.startTime = null;
    this.emit('stopped');
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      packetsUdpSent: 0,
      packetsTcpSent: 0,
      bytesUdpSent: 0,
      bytesTcpSent: 0,
      udpErrors: 0,
      tcpErrors: 0,
      callsStarted: 0,
      callsEnded: 0,
      lastPacketTime: null,
      lastConnectionTime: null,
      lastError: null,
      lastErrorTime: null,
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get active call count
   */
  getActiveCallCount(): number {
    return this.activeCalls.size;
  }
}
