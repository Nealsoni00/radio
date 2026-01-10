import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock dgram module
vi.mock('dgram', () => ({
  default: {
    createSocket: vi.fn(() => {
      const socket = new EventEmitter() as any;
      socket.bind = vi.fn((port, callback) => callback?.());
      socket.close = vi.fn((callback) => callback?.());
      return socket;
    }),
  },
}));

import dgram from 'dgram';
import { AudioReceiver } from './audio-receiver.js';

describe('AudioReceiver', () => {
  let receiver: AudioReceiver;
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();
    receiver = new AudioReceiver(9000);
    mockSocket = (dgram.createSocket as any).mock.results[0]?.value;
  });

  afterEach(() => {
    receiver.stop();
  });

  describe('initialization', () => {
    it('should create a UDP socket', () => {
      expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
    });

    it('should not be listening before start', () => {
      expect(receiver.isListening()).toBe(false);
    });
  });

  describe('start', () => {
    it('should bind to the specified port', () => {
      receiver.start();
      expect(mockSocket.bind).toHaveBeenCalledWith(9000, expect.any(Function));
    });

    it('should set isListening to true after binding', () => {
      receiver.start();
      expect(receiver.isListening()).toBe(true);
    });

    it('should not bind again if already started', () => {
      receiver.start();
      receiver.start();
      expect(mockSocket.bind).toHaveBeenCalledTimes(1);
    });
  });

  describe('packet parsing - JSON format', () => {
    it('should parse JSON metadata packet correctly', () => {
      receiver.start();

      const audioHandler = vi.fn();
      receiver.on('audio', audioHandler);

      // Create JSON metadata packet: [4 bytes length][JSON][PCM data]
      const metadata = {
        talkgroup: 1234,
        freq: 851250000,
        talkgrouptag: 'Test TG',
      };
      const jsonStr = JSON.stringify(metadata);
      const jsonBuffer = Buffer.from(jsonStr);
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(jsonBuffer.length, 0);

      const pcmData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const packet = Buffer.concat([headerLen, jsonBuffer, pcmData]);

      // Simulate receiving the packet
      mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });

      expect(audioHandler).toHaveBeenCalledTimes(1);
      const emittedPacket = audioHandler.mock.calls[0][0];
      expect(emittedPacket.talkgroupId).toBe(1234);
      expect(emittedPacket.pcmData).toEqual(pcmData);
      expect(emittedPacket.metadata).toEqual(metadata);
    });

    it('should handle packet with complex metadata', () => {
      receiver.start();

      const audioHandler = vi.fn();
      receiver.on('audio', audioHandler);

      const metadata = {
        talkgroup: 925,
        freq: 852387500,
        talkgrouptag: '39d',
        talkgroup_group_tag: 'Control A1 - Downtown Dispatch',
        emergency: false,
        encrypted: false,
      };
      const jsonStr = JSON.stringify(metadata);
      const jsonBuffer = Buffer.from(jsonStr);
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(jsonBuffer.length, 0);

      const pcmData = Buffer.alloc(1600); // 100ms of audio at 8kHz 16-bit
      const packet = Buffer.concat([headerLen, jsonBuffer, pcmData]);

      mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });

      expect(audioHandler).toHaveBeenCalledTimes(1);
      const emittedPacket = audioHandler.mock.calls[0][0];
      expect(emittedPacket.talkgroupId).toBe(925);
      expect(emittedPacket.metadata.freq).toBe(852387500);
      expect(emittedPacket.metadata.talkgroup_group_tag).toBe('Control A1 - Downtown Dispatch');
    });
  });

  describe('packet parsing - TGID-only format', () => {
    it('should parse TGID-only packet correctly', () => {
      receiver.start();

      const audioHandler = vi.fn();
      receiver.on('audio', audioHandler);

      // Create TGID-only packet: [4 bytes TGID][PCM data]
      const tgidBuffer = Buffer.alloc(4);
      tgidBuffer.writeUInt32LE(50000, 0); // Large TGID that won't be mistaken for JSON length

      const pcmData = Buffer.from([0x10, 0x20, 0x30, 0x40]);
      const packet = Buffer.concat([tgidBuffer, pcmData]);

      mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });

      expect(audioHandler).toHaveBeenCalledTimes(1);
      const emittedPacket = audioHandler.mock.calls[0][0];
      expect(emittedPacket.talkgroupId).toBe(50000);
      expect(emittedPacket.pcmData).toEqual(pcmData);
    });
  });

  describe('packet parsing - edge cases', () => {
    it('should reject packets smaller than 4 bytes', () => {
      receiver.start();

      const audioHandler = vi.fn();
      receiver.on('audio', audioHandler);

      const packet = Buffer.from([0x01, 0x02, 0x03]); // Only 3 bytes
      mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });

      expect(audioHandler).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully', () => {
      receiver.start();

      const audioHandler = vi.fn();
      const errorHandler = vi.fn();
      receiver.on('audio', audioHandler);

      // Create packet with invalid JSON but valid-looking header
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(20, 0); // 20 bytes of "JSON"
      const invalidJson = Buffer.from('this is not valid json');
      const pcmData = Buffer.from([0x00, 0x01]);
      const packet = Buffer.concat([headerLen, invalidJson, pcmData]);

      // Should fall back to TGID-only parsing
      mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });

      // Should still emit with TGID = 20 (the header length value)
      expect(audioHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle empty PCM data', () => {
      receiver.start();

      const audioHandler = vi.fn();
      receiver.on('audio', audioHandler);

      const metadata = { talkgroup: 100 };
      const jsonStr = JSON.stringify(metadata);
      const jsonBuffer = Buffer.from(jsonStr);
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(jsonBuffer.length, 0);

      const packet = Buffer.concat([headerLen, jsonBuffer]); // No PCM data

      mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });

      expect(audioHandler).toHaveBeenCalledTimes(1);
      const emittedPacket = audioHandler.mock.calls[0][0];
      expect(emittedPacket.pcmData.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should emit error events from socket', () => {
      receiver.start();

      const errorHandler = vi.fn();
      receiver.on('error', errorHandler);

      const error = new Error('Test socket error');
      mockSocket.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });
  });

  describe('stop', () => {
    it('should close the socket', () => {
      receiver.start();
      receiver.stop();

      expect(mockSocket.close).toHaveBeenCalled();
    });

    it('should set isListening to false', () => {
      receiver.start();
      expect(receiver.isListening()).toBe(true);

      receiver.stop();
      expect(receiver.isListening()).toBe(false);
    });

    it('should not close if not running', () => {
      receiver.stop();
      expect(mockSocket.close).not.toHaveBeenCalled();
    });
  });

  describe('multiple packets', () => {
    it('should handle rapid packet succession', () => {
      receiver.start();

      const audioHandler = vi.fn();
      receiver.on('audio', audioHandler);

      // Send 10 packets rapidly
      for (let i = 0; i < 10; i++) {
        const metadata = { talkgroup: 1000 + i };
        const jsonStr = JSON.stringify(metadata);
        const jsonBuffer = Buffer.from(jsonStr);
        const headerLen = Buffer.alloc(4);
        headerLen.writeUInt32LE(jsonBuffer.length, 0);
        const pcmData = Buffer.alloc(160);
        const packet = Buffer.concat([headerLen, jsonBuffer, pcmData]);

        mockSocket.emit('message', packet, { address: '127.0.0.1', port: 12345 });
      }

      expect(audioHandler).toHaveBeenCalledTimes(10);

      // Verify each packet has correct talkgroup ID
      for (let i = 0; i < 10; i++) {
        expect(audioHandler.mock.calls[i][0].talkgroupId).toBe(1000 + i);
      }
    });
  });
});
