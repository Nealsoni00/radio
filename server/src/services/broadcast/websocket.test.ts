import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ws module before any other imports
vi.mock('ws', async () => {
  const { EventEmitter } = await import('events');

  class MockWebSocketServer extends EventEmitter {
    constructor(_options: any) {
      super();
    }
  }

  return {
    WebSocket: { OPEN: 1, CLOSED: 3 },
    WebSocketServer: MockWebSocketServer,
  };
});

// Now import after mocking
const { EventEmitter } = await import('events');
const { BroadcastServer } = await import('./websocket.js');

// Constants for WebSocket states
const WS_OPEN = 1;
const WS_CLOSED = 3;

describe('BroadcastServer', () => {
  let broadcastServer: any;
  let mockWss: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockHttpServer = {} as any;
    broadcastServer = new BroadcastServer(mockHttpServer);
    // Get the internal WebSocketServer instance
    mockWss = (broadcastServer as any).wss;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create a mock WebSocket client
  function createMockClient(readyState = WS_OPEN) {
    const ws = new EventEmitter() as any;
    ws.readyState = readyState;
    ws.send = vi.fn();
    return ws;
  }

  // Helper to simulate a client connection
  function connectClient(ws: any) {
    mockWss.emit('connection', ws, { socket: { remoteAddress: '127.0.0.1' } });
    return ws;
  }

  describe('client connection', () => {
    it('should accept new client connections', () => {
      const ws = createMockClient();
      connectClient(ws);

      expect(broadcastServer.getClientCount()).toBe(1);
    });

    it('should send connected message to new client', () => {
      const ws = createMockClient();
      connectClient(ws);

      expect(ws.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(ws.send.mock.calls[0][0]);
      expect(message.type).toBe('connected');
      expect(message.clientId).toBeDefined();
    });

    it('should handle multiple client connections', () => {
      const ws1 = createMockClient();
      const ws2 = createMockClient();
      const ws3 = createMockClient();

      connectClient(ws1);
      connectClient(ws2);
      connectClient(ws3);

      expect(broadcastServer.getClientCount()).toBe(3);
    });

    it('should remove client on disconnect', () => {
      const ws = createMockClient();
      connectClient(ws);

      expect(broadcastServer.getClientCount()).toBe(1);

      ws.emit('close');

      expect(broadcastServer.getClientCount()).toBe(0);
    });
  });

  describe('enableAudio message', () => {
    it('should enable audio streaming for client', () => {
      const ws = createMockClient();
      connectClient(ws);

      // Send enableAudio message
      const enableMessage = JSON.stringify({ type: 'enableAudio', enabled: true });
      ws.emit('message', Buffer.from(enableMessage));

      // Verify client has audio enabled by sending audio and checking it's received
      const audioPacket = {
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00, 0x01, 0x02, 0x03]),
        metadata: { freq: 851250000 },
      };

      broadcastServer.broadcastAudio(audioPacket);

      // Should have received 2 messages: connected + audio
      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it('should not send audio to client with audio disabled', () => {
      const ws = createMockClient();
      connectClient(ws);

      // Client has audio disabled by default
      const audioPacket = {
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00, 0x01, 0x02, 0x03]),
        metadata: {},
      };

      broadcastServer.broadcastAudio(audioPacket);

      // Should only have the connected message
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('should disable audio streaming for client', () => {
      const ws = createMockClient();
      connectClient(ws);

      // Enable audio first
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));

      // Then disable it
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: false })));

      const audioPacket = {
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00, 0x01]),
        metadata: {},
      };

      broadcastServer.broadcastAudio(audioPacket);

      // Should only have the connected message
      expect(ws.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('talkgroup subscription', () => {
    it('should send audio to client subscribed to all talkgroups (empty set)', () => {
      const ws = createMockClient();
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'subscribeAll' })));

      const audioPacket = {
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      };

      broadcastServer.broadcastAudio(audioPacket);

      expect(ws.send).toHaveBeenCalledTimes(2); // connected + audio
    });

    it('should only send audio for subscribed talkgroups', () => {
      const ws = createMockClient();
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', talkgroups: [1234, 5678] })));

      // Send audio for subscribed talkgroup
      broadcastServer.broadcastAudio({
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      });

      // Send audio for non-subscribed talkgroup
      broadcastServer.broadcastAudio({
        talkgroupId: 9999,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      });

      // Should have: connected + one audio packet (only for TG 1234)
      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it('should handle unsubscribe', () => {
      const ws = createMockClient();
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', talkgroups: [1234, 5678] })));
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'unsubscribe', talkgroups: [1234] })));

      // Send audio for unsubscribed talkgroup
      broadcastServer.broadcastAudio({
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      });

      // Should only have connected message (TG 1234 was unsubscribed)
      expect(ws.send).toHaveBeenCalledTimes(1);

      // Send audio for still-subscribed talkgroup
      broadcastServer.broadcastAudio({
        talkgroupId: 5678,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      });

      // Now should have connected + one audio
      expect(ws.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('broadcastAudio', () => {
    it('should send binary message with correct format', () => {
      const ws = createMockClient();
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));

      const audioPacket = {
        talkgroupId: 925,
        pcmData: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]),
        metadata: {
          freq: 852387500,
          talkgrouptag: '39d',
        },
      };

      broadcastServer.broadcastAudio(audioPacket);

      // Get the binary message sent
      expect(ws.send).toHaveBeenCalledTimes(2); // connected + audio
      const binaryMessage = ws.send.mock.calls[1][0];
      expect(Buffer.isBuffer(binaryMessage)).toBe(true);

      // Parse the binary message
      const headerLen = binaryMessage.readUInt32LE(0);
      const headerJson = binaryMessage.slice(4, 4 + headerLen).toString('utf8');
      const header = JSON.parse(headerJson);
      const pcmData = binaryMessage.slice(4 + headerLen);

      expect(header.type).toBe('audio');
      expect(header.talkgroupId).toBe(925);
      expect(header.freq).toBe(852387500);
      expect(header.talkgrouptag).toBe('39d');
      expect(pcmData).toEqual(audioPacket.pcmData);
    });

    it('should send to multiple clients with audio enabled', () => {
      const ws1 = createMockClient();
      const ws2 = createMockClient();
      const ws3 = createMockClient();

      connectClient(ws1);
      connectClient(ws2);
      connectClient(ws3);

      // Enable audio only for ws1 and ws3
      ws1.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));
      ws3.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));

      const audioPacket = {
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      };

      broadcastServer.broadcastAudio(audioPacket);

      // ws1: connected + audio = 2
      // ws2: connected only = 1
      // ws3: connected + audio = 2
      expect(ws1.send).toHaveBeenCalledTimes(2);
      expect(ws2.send).toHaveBeenCalledTimes(1);
      expect(ws3.send).toHaveBeenCalledTimes(2);
    });

    it('should not send to closed connections', () => {
      // Create client that starts OPEN, then closes
      const ws = createMockClient(WS_OPEN);
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));

      // Should have the connected message
      expect(ws.send).toHaveBeenCalledTimes(1);

      // Now simulate connection closing
      ws.readyState = WS_CLOSED;

      const audioPacket = {
        talkgroupId: 1234,
        pcmData: Buffer.from([0x00]),
        metadata: {},
      };

      broadcastServer.broadcastAudio(audioPacket);

      // Should still only have the connected message (audio not sent to closed connection)
      expect(ws.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastNewRecording', () => {
    it('should broadcast to subscribed clients regardless of streamAudio', () => {
      const ws1 = createMockClient();
      const ws2 = createMockClient();

      connectClient(ws1);
      connectClient(ws2);

      // ws1 has audio disabled but is subscribed to all
      ws1.emit('message', Buffer.from(JSON.stringify({ type: 'subscribeAll' })));

      // ws2 has audio enabled and subscribed to specific TG
      ws2.emit('message', Buffer.from(JSON.stringify({ type: 'enableAudio', enabled: true })));
      ws2.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', talkgroups: [1234] })));

      broadcastServer.broadcastNewRecording({
        id: 'test-call-1',
        talkgroupId: 1234,
        alphaTag: 'Test TG',
        groupTag: 'Test Group Tag',
        audioUrl: '/api/audio/test-call-1',
      });

      // Both should receive the newRecording message
      expect(ws1.send).toHaveBeenCalledTimes(2); // connected + newRecording
      expect(ws2.send).toHaveBeenCalledTimes(2); // connected + newRecording

      // Verify the message content
      const msg1 = JSON.parse(ws1.send.mock.calls[1][0]);
      expect(msg1.type).toBe('newRecording');
      expect(msg1.call.id).toBe('test-call-1');
      expect(msg1.call.talkgroupId).toBe(1234);
      expect(msg1.call.groupTag).toBe('Test Group Tag');
    });

    it('should not broadcast to clients not subscribed to talkgroup', () => {
      const ws = createMockClient();
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', talkgroups: [5678] })));

      broadcastServer.broadcastNewRecording({
        id: 'test-call-1',
        talkgroupId: 1234, // Different from subscribed
        audioUrl: '/api/audio/test-call-1',
      });

      // Should only have connected message
      expect(ws.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastCallStart and broadcastCallEnd', () => {
    it('should broadcast callStart to subscribed clients', () => {
      const ws = createMockClient();
      connectClient(ws);

      broadcastServer.broadcastCallStart({
        id: 'call-1',
        talkgroupId: 1234,
        alphaTag: 'Test TG',
        frequency: 851250000,
      });

      expect(ws.send).toHaveBeenCalledTimes(2); // connected + callStart
      const msg = JSON.parse(ws.send.mock.calls[1][0]);
      expect(msg.type).toBe('callStart');
      expect(msg.call.talkgroupId).toBe(1234);
    });

    it('should broadcast callEnd to subscribed clients', () => {
      const ws = createMockClient();
      connectClient(ws);

      broadcastServer.broadcastCallEnd({
        id: 'call-1',
        talkgroupId: 1234,
        duration: 10,
      });

      expect(ws.send).toHaveBeenCalledTimes(2); // connected + callEnd
      const msg = JSON.parse(ws.send.mock.calls[1][0]);
      expect(msg.type).toBe('callEnd');
      expect(msg.call.duration).toBe(10);
    });
  });

  describe('broadcastFFT', () => {
    it('should not broadcast FFT if no clients have FFT enabled', () => {
      const ws = createMockClient();
      connectClient(ws);

      const fftPacket = {
        sourceIndex: 0,
        centerFreq: 851000000,
        sampleRate: 2400000,
        timestamp: Date.now(),
        fftSize: 1024,
        minFreq: 849800000,
        maxFreq: 852200000,
        magnitudes: new Float32Array(1024),
      };

      broadcastServer.broadcastFFT(fftPacket);

      // Should only have connected message
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('should broadcast FFT to clients with FFT enabled', () => {
      const ws = createMockClient();
      connectClient(ws);
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'enableFFT', enabled: true })));

      const magnitudes = new Float32Array(512);
      magnitudes.fill(-80.0);

      const fftPacket = {
        sourceIndex: 0,
        centerFreq: 851000000,
        sampleRate: 2400000,
        timestamp: Date.now(),
        fftSize: 512,
        minFreq: 849800000,
        maxFreq: 852200000,
        magnitudes,
      };

      broadcastServer.broadcastFFT(fftPacket);

      expect(ws.send).toHaveBeenCalledTimes(2); // connected + FFT
      const binaryMessage = ws.send.mock.calls[1][0];
      expect(Buffer.isBuffer(binaryMessage)).toBe(true);

      // Parse FFT message
      const headerLen = binaryMessage.readUInt32LE(0);
      const headerJson = binaryMessage.slice(4, 4 + headerLen).toString('utf8');
      const header = JSON.parse(headerJson);

      expect(header.type).toBe('fft');
      expect(header.fftSize).toBe(512);
      expect(header.centerFreq).toBe(851000000);
    });
  });

  describe('broadcastRates', () => {
    it('should broadcast decode rates to all clients', () => {
      const ws1 = createMockClient();
      const ws2 = createMockClient();
      connectClient(ws1);
      connectClient(ws2);

      broadcastServer.broadcastRates({
        'san-francisco-co': { decoderate: 5 },
      });

      expect(ws1.send).toHaveBeenCalledTimes(2); // connected + rates
      expect(ws2.send).toHaveBeenCalledTimes(2);

      const msg = JSON.parse(ws1.send.mock.calls[1][0]);
      expect(msg.type).toBe('rates');
      expect(msg.rates['san-francisco-co'].decoderate).toBe(5);
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON messages gracefully', () => {
      const ws = createMockClient();
      connectClient(ws);

      // Send invalid JSON
      ws.emit('message', Buffer.from('not valid json'));

      // Should not crash, client should still be connected
      expect(broadcastServer.getClientCount()).toBe(1);
    });

    it('should handle WebSocket errors', () => {
      const ws = createMockClient();
      connectClient(ws);

      const error = new Error('WebSocket error');
      ws.emit('error', error);

      // Should not crash
      expect(broadcastServer.getClientCount()).toBe(1);
    });
  });
});
