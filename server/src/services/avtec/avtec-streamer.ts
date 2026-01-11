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

interface AvtecStreamerConfig {
  targetHost: string;
  targetPort: number;
  enabled: boolean;
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
}

export class AvtecStreamer extends EventEmitter {
  private config: AvtecStreamerConfig;
  private tcpSocket: Socket | null = null;
  private udpSocket: UdpSocket | null = null;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private sessionIdCounter = 1;
  private connected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: Partial<AvtecStreamerConfig> = {}) {
    super();
    this.config = {
      targetHost: config.targetHost || '127.0.0.1',
      targetPort: config.targetPort || 50911,
      enabled: config.enabled ?? true,
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

    console.log(`[AvtecStreamer] Starting - connecting to ${this.config.targetHost}:${this.config.targetPort}`);

    // Create UDP socket for audio
    this.udpSocket = createSocket('udp4');
    this.udpSocket.on('error', (err) => {
      console.error('[AvtecStreamer] UDP socket error:', err);
    });

    // Connect TCP socket for metadata
    await this.connectTcp();
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
          this.emit('connected');
          resolve();
        }
      );

      this.tcpSocket.on('error', (err) => {
        console.error('[AvtecStreamer] TCP error:', err.message);
        this.connected = false;
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

    console.log(
      `[AvtecStreamer] Call started: ${call.id} TG:${call.talkgroupId} (${activeCall.alphaTag}) sessionId:${sessionId} ssrc:${ssrc}`
    );
  }

  /**
   * Handle call end event from trunk-recorder
   */
  handleCallEnd(callId: string): void {
    if (!this.config.enabled) return;

    const activeCall = this.activeCalls.get(callId);
    if (!activeCall) {
      return;
    }

    // Send update packet indicating call end (optional, some receivers don't need this)
    // The call will naturally end when audio stops

    this.activeCalls.delete(callId);

    console.log(`[AvtecStreamer] Call ended: ${callId} TG:${activeCall.talkgroupId}`);
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
