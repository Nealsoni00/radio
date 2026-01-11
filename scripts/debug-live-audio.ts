#!/usr/bin/env npx tsx
/**
 * Live Audio Debugging Script
 *
 * This script helps diagnose issues with the live audio streaming pipeline.
 * It tests multiple points in the data flow:
 *
 * 1. UDP Reception - Listen directly to port 9000 to see if trunk-recorder is sending audio
 * 2. WebSocket Client - Connect to the server's WebSocket to see if audio is being broadcast
 * 3. Simulated Audio - Send test audio packets to verify the server is processing correctly
 *
 * Usage:
 *   npx tsx scripts/debug-live-audio.ts [mode]
 *
 * Modes:
 *   udp       - Listen for UDP packets on port 9000 (requires server to be stopped)
 *   websocket - Connect to WebSocket and listen for audio broadcasts
 *   simulate  - Send simulated audio packets to UDP port 9000
 *   all       - Run all tests (default)
 */

import dgram from 'dgram';
import WebSocket from 'ws';

const UDP_PORT = 9000;
const WS_URL = 'ws://localhost:3000/ws';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color: string, prefix: string, message: string) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`${colors.cyan}[${timestamp}]${colors.reset} ${color}[${prefix}]${colors.reset} ${message}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Test 1: Listen for UDP packets on port 9000
 * This tests if trunk-recorder is sending audio data
 */
async function testUdpReception(): Promise<void> {
  return new Promise((resolve) => {
    log(colors.blue, 'UDP', `Starting UDP listener on port ${UDP_PORT}...`);
    log(colors.yellow, 'UDP', 'Note: The server must be stopped for this test (it binds to the same port)');

    const socket = dgram.createSocket('udp4');
    let packetCount = 0;
    let totalBytes = 0;
    const startTime = Date.now();

    socket.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        log(colors.red, 'UDP', `Port ${UDP_PORT} is already in use (server is running)`);
        log(colors.yellow, 'UDP', 'Run "just stop" first, then re-run this test');
      } else {
        log(colors.red, 'UDP', `Error: ${err.message}`);
      }
      socket.close();
      resolve();
    });

    socket.on('message', (msg, rinfo) => {
      packetCount++;
      totalBytes += msg.length;

      // Parse the packet
      try {
        const firstUint32 = msg.readUInt32LE(0);

        // Check if it's JSON format (length prefix < 10000)
        if (firstUint32 > 0 && firstUint32 < 10000 && firstUint32 < msg.length) {
          const jsonStr = msg.slice(4, 4 + firstUint32).toString('utf8');
          const metadata = JSON.parse(jsonStr);
          const pcmBytes = msg.length - 4 - firstUint32;
          const pcmSamples = pcmBytes / 2; // Int16 = 2 bytes per sample
          const duration = pcmSamples / (metadata.audio_sample_rate || 8000);

          log(colors.green, 'UDP',
            `Packet #${packetCount}: TG=${metadata.talkgroup} ` +
            `event=${metadata.event} samples=${pcmSamples} ` +
            `duration=${(duration * 1000).toFixed(0)}ms ` +
            `rate=${metadata.audio_sample_rate || 'unknown'}Hz`
          );

          if (packetCount <= 3) {
            log(colors.magenta, 'UDP', `Metadata: ${JSON.stringify(metadata)}`);
          }
        } else {
          // TGID-only format
          log(colors.yellow, 'UDP', `Packet #${packetCount}: TGID-only format, TGID=${firstUint32}, ${formatBytes(msg.length - 4)} audio`);
        }
      } catch (err) {
        log(colors.red, 'UDP', `Failed to parse packet: ${err}`);
        log(colors.yellow, 'UDP', `Raw first 100 bytes: ${msg.slice(0, 100).toString('hex')}`);
      }

      // Log stats every 10 seconds
      const elapsed = (Date.now() - startTime) / 1000;
      if (packetCount % 50 === 0) {
        log(colors.cyan, 'UDP', `Stats: ${packetCount} packets, ${formatBytes(totalBytes)}, ${(packetCount / elapsed).toFixed(1)} packets/sec`);
      }
    });

    socket.bind(UDP_PORT, () => {
      log(colors.green, 'UDP', `Listening on port ${UDP_PORT}... (Ctrl+C to stop)`);
      log(colors.yellow, 'UDP', 'Waiting for audio packets from trunk-recorder...');
    });

    // Run for 60 seconds then stop
    setTimeout(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      log(colors.blue, 'UDP', `Test complete: ${packetCount} packets received in ${elapsed.toFixed(0)}s`);
      if (packetCount === 0) {
        log(colors.red, 'UDP', 'No packets received! trunk-recorder may not be running or configured correctly.');
        log(colors.yellow, 'UDP', 'Check: trunk-recorder/config.json has simplestream plugin enabled with port 9000');
      }
      socket.close();
      resolve();
    }, 60000);
  });
}

/**
 * Test 2: Connect to WebSocket and listen for audio broadcasts
 * This tests if the server is receiving and forwarding audio
 */
async function testWebSocketAudio(): Promise<void> {
  return new Promise((resolve) => {
    log(colors.blue, 'WS', `Connecting to ${WS_URL}...`);

    const ws = new WebSocket(WS_URL);
    let packetCount = 0;
    let jsonMessageCount = 0;
    let binaryMessageCount = 0;
    let audioPacketCount = 0;
    let fftPacketCount = 0;
    const startTime = Date.now();

    ws.on('open', () => {
      log(colors.green, 'WS', 'Connected to WebSocket');

      // Subscribe to all talkgroups
      ws.send(JSON.stringify({ type: 'subscribeAll' }));
      log(colors.blue, 'WS', 'Sent: subscribeAll');

      // Enable audio streaming
      ws.send(JSON.stringify({ type: 'enableAudio', enabled: true }));
      log(colors.blue, 'WS', 'Sent: enableAudio(true)');

      log(colors.yellow, 'WS', 'Waiting for audio broadcasts...');
    });

    ws.on('message', (data) => {
      packetCount++;

      if (data instanceof Buffer || data instanceof ArrayBuffer) {
        binaryMessageCount++;
        const buffer = data instanceof Buffer ? data : Buffer.from(data);

        // Parse header
        try {
          const headerLen = buffer.readUInt32LE(0);
          const headerStr = buffer.slice(4, 4 + headerLen).toString('utf8');
          const header = JSON.parse(headerStr);

          if (header.type === 'audio') {
            audioPacketCount++;
            const audioBytes = buffer.length - 4 - headerLen;
            const samples = audioBytes / 2;
            const duration = samples / (header.audio_sample_rate || 8000);

            log(colors.green, 'WS',
              `Audio packet #${audioPacketCount}: TG=${header.talkgroupId} ` +
              `samples=${samples} duration=${(duration * 1000).toFixed(0)}ms ` +
              `alphaTag="${header.alphaTag || 'unknown'}"`
            );

            if (audioPacketCount <= 3) {
              log(colors.magenta, 'WS', `Audio header: ${JSON.stringify(header)}`);
            }
          } else if (header.type === 'fft') {
            fftPacketCount++;
            if (fftPacketCount % 30 === 0) { // Log FFT every ~1 second
              log(colors.cyan, 'WS', `FFT packet #${fftPacketCount}: ${header.fftSize} bins`);
            }
          } else {
            log(colors.yellow, 'WS', `Binary message type: ${header.type}`);
          }
        } catch (err) {
          log(colors.red, 'WS', `Failed to parse binary message: ${err}`);
        }
      } else {
        jsonMessageCount++;
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'connected') {
            log(colors.green, 'WS', `Connected with client ID: ${msg.clientId}`);
          } else if (msg.type === 'callStart') {
            log(colors.cyan, 'WS', `Call start: TG=${msg.call?.talkgroupId} "${msg.call?.alphaTag}"`);
          } else if (msg.type === 'callEnd') {
            log(colors.cyan, 'WS', `Call end: TG=${msg.call?.talkgroupId} duration=${msg.call?.duration}s`);
          } else if (msg.type === 'rates') {
            const rate = Object.values(msg.rates || {})[0] as any;
            if (rate) {
              log(colors.cyan, 'WS', `Decode rate: ${rate.decoderate}`);
            }
          } else {
            log(colors.yellow, 'WS', `JSON message: ${msg.type}`);
          }
        } catch {
          log(colors.yellow, 'WS', `Raw message: ${data.toString().slice(0, 100)}`);
        }
      }

      // Log stats every 50 packets
      if (packetCount % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        log(colors.blue, 'WS',
          `Stats: ${packetCount} total, ${jsonMessageCount} JSON, ${binaryMessageCount} binary ` +
          `(${audioPacketCount} audio, ${fftPacketCount} FFT) in ${elapsed.toFixed(0)}s`
        );
      }
    });

    ws.on('close', () => {
      log(colors.yellow, 'WS', 'WebSocket closed');
      resolve();
    });

    ws.on('error', (err) => {
      log(colors.red, 'WS', `WebSocket error: ${err.message}`);
      if (err.message.includes('ECONNREFUSED')) {
        log(colors.yellow, 'WS', 'Server is not running. Start it with "just start" or "just dev"');
      }
      resolve();
    });

    // Run for 60 seconds then stop
    setTimeout(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      log(colors.blue, 'WS', `Test complete: ${audioPacketCount} audio packets in ${elapsed.toFixed(0)}s`);
      if (audioPacketCount === 0 && binaryMessageCount > 0) {
        log(colors.yellow, 'WS', 'Received binary messages but no audio - check if audio streaming is enabled on server');
      } else if (audioPacketCount === 0) {
        log(colors.red, 'WS', 'No audio packets received! Possible issues:');
        log(colors.yellow, 'WS', '  1. trunk-recorder not running');
        log(colors.yellow, 'WS', '  2. simplestream plugin not configured');
        log(colors.yellow, 'WS', '  3. Server not forwarding audio packets');
      }
      ws.close();
      resolve();
    }, 60000);
  });
}

/**
 * Test 3: Send simulated audio packets to verify server processing
 */
async function testSimulatedAudio(): Promise<void> {
  return new Promise((resolve) => {
    log(colors.blue, 'SIM', 'Starting simulated audio test...');

    const socket = dgram.createSocket('udp4');
    let packetsSent = 0;
    const startTime = Date.now();

    // Generate a simple sine wave tone
    function generateTone(frequency: number, sampleRate: number, durationMs: number): Int16Array {
      const numSamples = Math.floor((sampleRate * durationMs) / 1000);
      const samples = new Int16Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        // Simple sine wave at the given frequency
        samples[i] = Math.floor(Math.sin(2 * Math.PI * frequency * t) * 16000);
      }
      return samples;
    }

    function sendTestPacket() {
      const talkgroupId = 1000 + Math.floor(Math.random() * 5); // Random TG between 1000-1004
      const sampleRate = 8000;
      const durationMs = 100; // 100ms of audio per packet
      const frequency = 440 + Math.random() * 440; // Random frequency 440-880 Hz

      // Generate audio samples
      const samples = generateTone(frequency, sampleRate, durationMs);

      // Create JSON metadata
      const metadata = {
        src: 12345,
        src_tag: 'TEST_UNIT',
        talkgroup: talkgroupId,
        patched_talkgroups: [talkgroupId],
        freq: 851000000 + talkgroupId * 1000000,
        short_name: 'test-system',
        audio_sample_rate: sampleRate,
        event: 'audio',
      };

      const jsonStr = JSON.stringify(metadata);
      const jsonBuf = Buffer.from(jsonStr);

      // Build packet: [4 bytes JSON length][JSON][PCM data]
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(jsonBuf.length, 0);

      const pcmBuf = Buffer.from(samples.buffer);
      const packet = Buffer.concat([headerLen, jsonBuf, pcmBuf]);

      socket.send(packet, UDP_PORT, '127.0.0.1', (err) => {
        if (err) {
          log(colors.red, 'SIM', `Send error: ${err.message}`);
        } else {
          packetsSent++;
          if (packetsSent <= 5 || packetsSent % 20 === 0) {
            log(colors.green, 'SIM',
              `Sent packet #${packetsSent}: TG=${talkgroupId} ` +
              `${samples.length} samples (${durationMs}ms @ ${sampleRate}Hz)`
            );
          }
        }
      });
    }

    // Send packets every 100ms (simulating real-time audio stream)
    const interval = setInterval(sendTestPacket, 100);

    log(colors.yellow, 'SIM', 'Sending test audio packets every 100ms...');
    log(colors.yellow, 'SIM', 'Check server logs and WebSocket client to verify reception');

    // Run for 10 seconds
    setTimeout(() => {
      clearInterval(interval);
      socket.close();
      const elapsed = (Date.now() - startTime) / 1000;
      log(colors.blue, 'SIM', `Test complete: ${packetsSent} packets sent in ${elapsed.toFixed(1)}s`);
      resolve();
    }, 10000);
  });
}

// Main entry point
async function main() {
  const mode = process.argv[2] || 'all';

  console.log('');
  log(colors.magenta, 'DEBUG', '=== Live Audio Debugging Script ===');
  console.log('');

  switch (mode) {
    case 'udp':
      await testUdpReception();
      break;
    case 'websocket':
    case 'ws':
      await testWebSocketAudio();
      break;
    case 'simulate':
    case 'sim':
      await testSimulatedAudio();
      break;
    case 'all':
    default:
      log(colors.blue, 'DEBUG', 'Running WebSocket test (server must be running)...');
      console.log('');
      await testWebSocketAudio();
      break;
  }

  console.log('');
  log(colors.magenta, 'DEBUG', '=== Test Complete ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
