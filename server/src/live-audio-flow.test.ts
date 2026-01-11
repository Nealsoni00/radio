import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Live Audio Streaming End-to-End Flow Tests
 *
 * These tests verify the complete flow of live audio streaming:
 * 1. trunk-recorder sends audio packets via UDP
 * 2. AudioReceiver parses packets and emits audio events
 * 3. BroadcastServer sends audio to subscribed WebSocket clients
 * 4. Clients receive binary audio data with metadata
 *
 * Also tests the recording flow:
 * 1. trunk-recorder sends callStart via WebSocket
 * 2. trunk-recorder sends callEnd with filename via WebSocket
 * 3. Server broadcasts updates to clients
 * 4. Clients update their call lists with audio_file
 */

// Simulated AudioReceiver
class MockAudioReceiver extends EventEmitter {
  private running = false;

  start() {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  isListening() {
    return this.running;
  }

  // Simulate receiving a UDP packet
  simulatePacket(talkgroupId: number, pcmData: Buffer, metadata?: Record<string, unknown>) {
    if (!this.running) return;

    this.emit('audio', {
      talkgroupId,
      pcmData,
      metadata: {
        talkgroup: talkgroupId,
        ...metadata,
      },
    });
  }
}

// Simulated BroadcastServer
class MockBroadcastServer extends EventEmitter {
  private clients: Map<string, MockClient> = new Map();

  connect(clientId: string) {
    const client = new MockClient(clientId);
    this.clients.set(clientId, client);
    client.on('message', (msg) => this.handleClientMessage(clientId, msg));
    this.sendToClient(clientId, { type: 'connected', clientId });
    return client;
  }

  disconnect(clientId: string) {
    this.clients.delete(clientId);
  }

  private handleClientMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'enableAudio':
        client.audioEnabled = message.enabled;
        break;
      case 'subscribeAll':
        client.subscribedTalkgroups = new Set();
        break;
      case 'subscribe':
        message.talkgroups?.forEach((tg: number) => client.subscribedTalkgroups.add(tg));
        break;
    }
  }

  private sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (client) {
      client.receivedMessages.push(message);
    }
  }

  broadcastAudio(packet: { talkgroupId: number; pcmData: Buffer; metadata: Record<string, unknown> }) {
    this.clients.forEach((client) => {
      if (!client.audioEnabled) return;
      if (client.subscribedTalkgroups.size > 0 && !client.subscribedTalkgroups.has(packet.talkgroupId)) return;

      // Build binary message like the real server does
      const header = Buffer.from(JSON.stringify({
        type: 'audio',
        talkgroupId: packet.talkgroupId,
        ...packet.metadata,
      }));
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(header.length, 0);
      const binaryMessage = Buffer.concat([headerLen, header, packet.pcmData]);

      client.receivedBinaryMessages.push(binaryMessage);
    });
  }

  broadcastCallStart(call: any) {
    const message = { type: 'callStart', call };
    this.clients.forEach((client) => {
      if (client.subscribedTalkgroups.size > 0 && !client.subscribedTalkgroups.has(call.talkgroupId)) return;
      client.receivedMessages.push(message);
    });
  }

  broadcastCallEnd(call: any) {
    const message = { type: 'callEnd', call };
    this.clients.forEach((client) => {
      if (client.subscribedTalkgroups.size > 0 && !client.subscribedTalkgroups.has(call.talkgroupId)) return;
      client.receivedMessages.push(message);
    });
  }

  broadcastNewRecording(call: any) {
    const message = { type: 'newRecording', call };
    this.clients.forEach((client) => {
      if (client.subscribedTalkgroups.size > 0 && !client.subscribedTalkgroups.has(call.talkgroupId)) return;
      client.receivedMessages.push(message);
    });
  }

  getClient(clientId: string) {
    return this.clients.get(clientId);
  }

  getClientCount() {
    return this.clients.size;
  }
}

class MockClient extends EventEmitter {
  audioEnabled = false;
  subscribedTalkgroups = new Set<number>();
  receivedMessages: any[] = [];
  receivedBinaryMessages: Buffer[] = [];

  constructor(public id: string) {
    super();
  }

  send(message: any) {
    this.emit('message', message);
  }

  enableAudio(enabled: boolean) {
    this.send({ type: 'enableAudio', enabled });
  }

  subscribeAll() {
    this.send({ type: 'subscribeAll' });
  }

  subscribe(talkgroups: number[]) {
    this.send({ type: 'subscribe', talkgroups });
  }
}

describe('Live Audio Streaming Flow', () => {
  let audioReceiver: MockAudioReceiver;
  let broadcastServer: MockBroadcastServer;

  beforeEach(() => {
    audioReceiver = new MockAudioReceiver();
    broadcastServer = new MockBroadcastServer();

    // Wire up audio receiver to broadcast server
    audioReceiver.on('audio', (packet) => {
      broadcastServer.broadcastAudio(packet);
    });
  });

  describe('Audio Packet Flow', () => {
    it('should deliver audio packets to subscribed clients', () => {
      audioReceiver.start();

      // Connect client and enable audio
      const client = broadcastServer.connect('client_001');
      client.enableAudio(true);
      client.subscribeAll();

      // Simulate receiving audio
      const pcmData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      audioReceiver.simulatePacket(927, pcmData, { freq: 852387500 });

      // Verify client received binary audio
      expect(client.receivedBinaryMessages).toHaveLength(1);

      // Parse the binary message
      const msg = client.receivedBinaryMessages[0];
      const headerLen = msg.readUInt32LE(0);
      const header = JSON.parse(msg.slice(4, 4 + headerLen).toString());
      const audioData = msg.slice(4 + headerLen);

      expect(header.type).toBe('audio');
      expect(header.talkgroupId).toBe(927);
      expect(header.freq).toBe(852387500);
      expect(audioData).toEqual(pcmData);
    });

    it('should not deliver audio to clients with audio disabled', () => {
      audioReceiver.start();

      const client = broadcastServer.connect('client_001');
      // Audio disabled by default

      audioReceiver.simulatePacket(927, Buffer.from([0x00]));

      expect(client.receivedBinaryMessages).toHaveLength(0);
    });

    it('should filter audio by talkgroup subscription', () => {
      audioReceiver.start();

      const client = broadcastServer.connect('client_001');
      client.enableAudio(true);
      client.subscribe([927, 929]); // Subscribe to specific TGs

      // Send audio for subscribed TG
      audioReceiver.simulatePacket(927, Buffer.from([0x01]));

      // Send audio for non-subscribed TG
      audioReceiver.simulatePacket(928, Buffer.from([0x02]));

      // Send audio for another subscribed TG
      audioReceiver.simulatePacket(929, Buffer.from([0x03]));

      // Should only have 2 messages (927 and 929)
      expect(client.receivedBinaryMessages).toHaveLength(2);
    });

    it('should deliver audio to multiple clients', () => {
      audioReceiver.start();

      const client1 = broadcastServer.connect('client_001');
      const client2 = broadcastServer.connect('client_002');
      const client3 = broadcastServer.connect('client_003');

      client1.enableAudio(true);
      client1.subscribeAll();

      client2.enableAudio(true);
      client2.subscribe([927]);

      client3.enableAudio(true);
      client3.subscribe([928]); // Different TG

      // Send audio for TG 927
      audioReceiver.simulatePacket(927, Buffer.from([0x00]));

      expect(client1.receivedBinaryMessages).toHaveLength(1); // Subscribed to all
      expect(client2.receivedBinaryMessages).toHaveLength(1); // Subscribed to 927
      expect(client3.receivedBinaryMessages).toHaveLength(0); // Subscribed to 928 only
    });

    it('should handle rapid audio packets', () => {
      audioReceiver.start();

      const client = broadcastServer.connect('client_001');
      client.enableAudio(true);
      client.subscribeAll();

      // Simulate 100 rapid packets
      for (let i = 0; i < 100; i++) {
        audioReceiver.simulatePacket(927, Buffer.alloc(160)); // 10ms of audio
      }

      expect(client.receivedBinaryMessages).toHaveLength(100);
    });
  });

  describe('Call Recording Flow', () => {
    it('should broadcast callStart to subscribed clients', () => {
      const client = broadcastServer.connect('client_001');
      client.subscribeAll();

      broadcastServer.broadcastCallStart({
        id: '927-1704825600',
        talkgroupId: 927,
        alphaTag: 'Control A2',
        frequency: 852387500,
        startTime: 1704825600,
      });

      const callStartMsg = client.receivedMessages.find(m => m.type === 'callStart');
      expect(callStartMsg).toBeDefined();
      expect(callStartMsg.call.id).toBe('927-1704825600');
      expect(callStartMsg.call.talkgroupId).toBe(927);
    });

    it('should broadcast callEnd with audio file to subscribed clients', () => {
      const client = broadcastServer.connect('client_001');
      client.subscribeAll();

      broadcastServer.broadcastCallEnd({
        id: '927-1704825600',
        talkgroupId: 927,
        alphaTag: 'Control A2',
        frequency: 852387500,
        startTime: 1704825600,
        stopTime: 1704825610,
        duration: 10,
        audioFile: '/var/lib/trunk-recorder/audio/927-1704825600.wav',
      });

      const callEndMsg = client.receivedMessages.find(m => m.type === 'callEnd');
      expect(callEndMsg).toBeDefined();
      expect(callEndMsg.call.audioFile).toBe('/var/lib/trunk-recorder/audio/927-1704825600.wav');
      expect(callEndMsg.call.duration).toBe(10);
    });

    it('should broadcast newRecording for auto-play', () => {
      const client = broadcastServer.connect('client_001');
      client.subscribeAll();

      broadcastServer.broadcastNewRecording({
        id: '927-1704825600',
        talkgroupId: 927,
        alphaTag: 'Control A2',
        audioUrl: '/api/audio/927-1704825600',
        duration: 10,
      });

      const newRecMsg = client.receivedMessages.find(m => m.type === 'newRecording');
      expect(newRecMsg).toBeDefined();
      expect(newRecMsg.call.audioUrl).toBe('/api/audio/927-1704825600');
    });

    it('should filter call broadcasts by talkgroup subscription', () => {
      const client = broadcastServer.connect('client_001');
      client.subscribe([927]);

      // Broadcast for subscribed TG
      broadcastServer.broadcastCallStart({
        id: 'call_1',
        talkgroupId: 927,
      });

      // Broadcast for non-subscribed TG
      broadcastServer.broadcastCallStart({
        id: 'call_2',
        talkgroupId: 928,
      });

      const callStartMessages = client.receivedMessages.filter(m => m.type === 'callStart');
      expect(callStartMessages).toHaveLength(1);
      expect(callStartMessages[0].call.talkgroupId).toBe(927);
    });
  });

  describe('Full Session Simulation', () => {
    it('should handle a complete live scanning session', () => {
      audioReceiver.start();

      // User connects and enables audio
      const client = broadcastServer.connect('user_001');
      client.enableAudio(true);
      client.subscribeAll();

      // First call starts
      broadcastServer.broadcastCallStart({
        id: '927-1000',
        talkgroupId: 927,
        alphaTag: 'Control A2',
        frequency: 852387500,
        startTime: 1000,
      });

      // Receive live audio packets
      for (let i = 0; i < 10; i++) {
        audioReceiver.simulatePacket(927, Buffer.alloc(160), { freq: 852387500 });
      }

      // First call ends
      broadcastServer.broadcastCallEnd({
        id: '927-1000',
        talkgroupId: 927,
        audioFile: '/audio/927-1000.wav',
        stopTime: 1010,
        duration: 10,
      });

      // Second call starts (different TG)
      broadcastServer.broadcastCallStart({
        id: '928-1015',
        talkgroupId: 928,
        alphaTag: 'Dispatch B1',
        frequency: 851250000,
        startTime: 1015,
      });

      // Receive live audio for second call
      for (let i = 0; i < 5; i++) {
        audioReceiver.simulatePacket(928, Buffer.alloc(160), { freq: 851250000 });
      }

      // Second call ends
      broadcastServer.broadcastCallEnd({
        id: '928-1015',
        talkgroupId: 928,
        audioFile: '/audio/928-1015.wav',
        stopTime: 1020,
        duration: 5,
      });

      // Verify client received all messages
      const callStarts = client.receivedMessages.filter(m => m.type === 'callStart');
      const callEnds = client.receivedMessages.filter(m => m.type === 'callEnd');

      expect(callStarts).toHaveLength(2);
      expect(callEnds).toHaveLength(2);
      expect(client.receivedBinaryMessages).toHaveLength(15); // 10 + 5 audio packets

      // Verify audio files are included in callEnd
      expect(callEnds[0].call.audioFile).toBe('/audio/927-1000.wav');
      expect(callEnds[1].call.audioFile).toBe('/audio/928-1015.wav');
    });

    it('should handle client disconnection and reconnection', () => {
      audioReceiver.start();

      // Initial connection
      let client = broadcastServer.connect('user_001');
      client.enableAudio(true);
      client.subscribeAll();

      audioReceiver.simulatePacket(927, Buffer.from([0x01]));
      expect(client.receivedBinaryMessages).toHaveLength(1);

      // Disconnect
      broadcastServer.disconnect('user_001');
      expect(broadcastServer.getClientCount()).toBe(0);

      // Reconnect
      client = broadcastServer.connect('user_001');
      client.enableAudio(true);
      client.subscribeAll();

      audioReceiver.simulatePacket(927, Buffer.from([0x02]));
      expect(client.receivedBinaryMessages).toHaveLength(1); // New client, fresh state
    });

    it('should handle changing talkgroup subscriptions mid-session', () => {
      audioReceiver.start();

      const client = broadcastServer.connect('user_001');
      client.enableAudio(true);
      client.subscribe([927]); // Initially subscribe to 927 only

      audioReceiver.simulatePacket(927, Buffer.from([0x01]));
      audioReceiver.simulatePacket(928, Buffer.from([0x02]));

      expect(client.receivedBinaryMessages).toHaveLength(1); // Only 927

      // Add subscription to 928
      client.subscribe([928]);

      audioReceiver.simulatePacket(928, Buffer.from([0x03]));

      expect(client.receivedBinaryMessages).toHaveLength(2); // 927 + new 928
    });
  });
});

describe('Audio Packet Binary Format', () => {
  it('should correctly parse binary audio packet', () => {
    // Build packet like the server does
    const metadata = {
      type: 'audio',
      talkgroupId: 927,
      freq: 852387500,
      talkgrouptag: '39d',
      emergency: false,
    };
    const header = Buffer.from(JSON.stringify(metadata));
    const headerLen = Buffer.alloc(4);
    headerLen.writeUInt32LE(header.length, 0);
    const pcmData = Buffer.alloc(1600); // 100ms at 8kHz 16-bit
    pcmData.fill(0x55); // Test pattern

    const packet = Buffer.concat([headerLen, header, pcmData]);

    // Parse it like the client does
    const parsedHeaderLen = packet.readUInt32LE(0);
    const parsedHeader = JSON.parse(packet.slice(4, 4 + parsedHeaderLen).toString());
    const parsedPcm = packet.slice(4 + parsedHeaderLen);

    expect(parsedHeader.type).toBe('audio');
    expect(parsedHeader.talkgroupId).toBe(927);
    expect(parsedHeader.freq).toBe(852387500);
    expect(parsedHeader.talkgrouptag).toBe('39d');
    expect(parsedPcm.length).toBe(1600);
    expect(parsedPcm[0]).toBe(0x55);
  });

  it('should handle variable-length metadata', () => {
    // Short metadata
    const shortMeta = { type: 'audio', talkgroupId: 1 };
    const shortHeader = Buffer.from(JSON.stringify(shortMeta));
    const shortHeaderLen = Buffer.alloc(4);
    shortHeaderLen.writeUInt32LE(shortHeader.length, 0);
    const shortPacket = Buffer.concat([shortHeaderLen, shortHeader, Buffer.from([0x00])]);

    // Long metadata
    const longMeta = {
      type: 'audio',
      talkgroupId: 12345678,
      freq: 852387500,
      talkgrouptag: 'This is a very long talkgroup tag that exceeds typical length',
      talkgroup_description: 'San Francisco Police Department - North Station - Downtown Dispatch',
      alphaTag: 'SFPD North',
      groupName: 'Law Enforcement',
      groupTag: 'Law Dispatch',
      emergency: false,
      encrypted: false,
    };
    const longHeader = Buffer.from(JSON.stringify(longMeta));
    const longHeaderLen = Buffer.alloc(4);
    longHeaderLen.writeUInt32LE(longHeader.length, 0);
    const longPacket = Buffer.concat([longHeaderLen, longHeader, Buffer.from([0x00])]);

    // Both should parse correctly
    const shortParsedLen = shortPacket.readUInt32LE(0);
    const shortParsedHeader = JSON.parse(shortPacket.slice(4, 4 + shortParsedLen).toString());
    expect(shortParsedHeader.talkgroupId).toBe(1);

    const longParsedLen = longPacket.readUInt32LE(0);
    const longParsedHeader = JSON.parse(longPacket.slice(4, 4 + longParsedLen).toString());
    expect(longParsedHeader.talkgroupId).toBe(12345678);
    expect(longParsedHeader.talkgroup_description).toContain('San Francisco');
  });
});
