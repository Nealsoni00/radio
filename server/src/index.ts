import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/index.js';
import { initializeDatabase, upsertTalkgroup, insertCall, insertCallSources } from './db/index.js';
import { TrunkRecorderStatusServer } from './services/trunk-recorder/status-server.js';
import { AudioReceiver } from './services/trunk-recorder/audio-receiver.js';
import { FFTReceiver } from './services/trunk-recorder/fft-receiver.js';
import { FileWatcher } from './services/trunk-recorder/file-watcher.js';
import { LogWatcher } from './services/trunk-recorder/log-watcher.js';
import { BroadcastServer } from './services/broadcast/websocket.js';
import { callRoutes } from './routes/api/calls.js';
import { talkgroupRoutes } from './routes/api/talkgroups.js';
import { audioRoutes } from './routes/api/audio.js';
import { radioReferenceRoutes } from './routes/api/radioreference.js';
import { spectrumRoutes } from './routes/api/spectrum.js';
import { FFTRecorder } from './services/spectrum/fft-recorder.js';
import { FFTReplayer } from './services/spectrum/fft-replayer.js';
import type { TRCallStart, TRCallEnd } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Process a completed call: save to database and optionally broadcast.
 * Consolidates duplicate logic from callEnd and fileWatcher handlers.
 */
function processCompletedCall(
  call: TRCallEnd,
  audioPath: string
): void {
  // Upsert talkgroup info
  upsertTalkgroup(
    call.talkgroup,
    call.talkgrouptag,
    call.talkgroupDescription,
    call.talkgroupGroup,
    call.talkgroupTag
  );

  // Insert call record
  insertCall({
    id: call.id,
    talkgroupId: call.talkgroup,
    frequency: call.freq,
    startTime: call.startTime,
    stopTime: call.stopTime,
    duration: call.length,
    emergency: call.emergency,
    encrypted: call.encrypted,
    audioFile: audioPath,
    audioType: call.audioType,
  });

  // Insert call sources
  if (call.srcList && call.srcList.length > 0) {
    insertCallSources(call.id, call.srcList);
  }
}

async function main() {
  // Initialize database
  initializeDatabase();

  // Create Fastify instance
  const app = Fastify({ logger: true });

  // Register plugins
  await app.register(cors, { origin: true });
  await app.register(fastifyStatic, {
    root: join(__dirname, '../../client/dist'),
    prefix: '/',
  });

  // Initialize trunk-recorder status server (trunk-recorder connects to us)
  const trStatusServer = new TrunkRecorderStatusServer(3001);

  // Initialize audio receiver
  const audioReceiver = new AudioReceiver(config.trunkRecorder.audioPort);

  // Initialize FFT receiver for spectrum visualization
  const fftReceiver = new FFTReceiver(config.trunkRecorder.fftPort);

  // Initialize FFT recording and replay services
  const fftRecorder = new FFTRecorder();
  const fftReplayer = new FFTReplayer(fftRecorder);

  // Initialize file watcher for recordings
  const fileWatcher = new FileWatcher(config.trunkRecorder.audioDir);

  // Initialize log watcher for control channel events
  const logWatcher = new LogWatcher('/tmp/trunk-recorder.log');

  // Register API routes
  await app.register(callRoutes);
  await app.register(talkgroupRoutes);
  await app.register(audioRoutes);
  await app.register(radioReferenceRoutes);
  await app.register(spectrumRoutes({ recorder: fftRecorder, replayer: fftReplayer }));

  // Health check endpoint
  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: Date.now(),
    trunkRecorder: trStatusServer.isConnected() || fileWatcher.isWatching(),
    fileWatcher: fileWatcher.isWatching(),
    fileWatcherActive: fileWatcher.isActive(),
    audioReceiver: audioReceiver.isListening(),
    clients: 0,
  }));

  // SPA fallback - serve index.html for all non-API routes (client-side routing)
  app.setNotFoundHandler(async (request, reply) => {
    // Don't serve index.html for API routes or WebSocket
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    // Serve index.html for client-side routes
    return reply.sendFile('index.html');
  });

  // SDR configuration endpoint (for in-band calculation)
  app.get('/api/sdr', async () => {
    const halfBandwidth = config.sdr.sampleRate / 2;
    return {
      centerFrequency: config.sdr.centerFrequency,
      sampleRate: config.sdr.sampleRate,
      minFrequency: config.sdr.centerFrequency - halfBandwidth,
      maxFrequency: config.sdr.centerFrequency + halfBandwidth,
    };
  });

  // Control channel events endpoint (for initial load)
  app.get('/api/control-channel', async (request) => {
    const { count = '100' } = request.query as { count?: string };
    const events = await logWatcher.getRecentEvents(parseInt(count, 10));
    return { events };
  });

  // Ensure Fastify is ready before creating HTTP server
  await app.ready();

  // Create HTTP server from Fastify's server
  const httpServer = app.server;

  // Initialize broadcast server (WebSocket)
  const broadcastServer = new BroadcastServer(httpServer);

  trStatusServer.on('callStart', (call: TRCallStart) => {
    console.log(`Call started: TG ${call.talkgroup} (${call.talkgrouptag})`);

    broadcastServer.broadcastCallStart({
      id: call.id,
      talkgroupId: call.talkgroup,
      alphaTag: call.talkgrouptag,
      frequency: call.freq,
      startTime: Math.floor(Date.now() / 1000),
      emergency: false,
      encrypted: false,
    });
  });

  trStatusServer.on('callEnd', (call: TRCallEnd) => {
    console.log(`Call ended: TG ${call.talkgroup} (${call.talkgrouptag}) - ${call.length}s`);

    // Save to database
    processCompletedCall(call, call.filename);

    // Broadcast to clients
    broadcastServer.broadcastCallEnd({
      id: call.id,
      talkgroupId: call.talkgroup,
      alphaTag: call.talkgrouptag,
      groupName: call.talkgroupGroup,
      groupTag: call.talkgroupTag,
      frequency: call.freq,
      startTime: call.startTime,
      stopTime: call.stopTime,
      duration: call.length,
      emergency: call.emergency,
      encrypted: call.encrypted,
      audioFile: call.filename,
    });
  });

  trStatusServer.on('callsActive', (calls: TRCallStart[]) => {
    broadcastServer.broadcastActiveCalls(
      calls.map((call) => ({
        id: call.id,
        talkgroupId: call.talkgroup,
        alphaTag: call.talkgrouptag,
        frequency: call.freq,
      }))
    );
  });

  trStatusServer.on('rates', (rates) => {
    broadcastServer.broadcastRates(rates);
  });

  audioReceiver.on('audio', (packet) => {
    broadcastServer.broadcastAudio(packet);
  });

  fftReceiver.on('fft', (packet) => {
    // Broadcast live FFT to clients
    broadcastServer.broadcastFFT(packet);
    // Also record if recording is active
    fftRecorder.addPacket(packet);
  });

  // Replayer broadcasts recorded FFT packets
  fftReplayer.on('fft', (packet) => {
    broadcastServer.broadcastFFT(packet);
  });

  fileWatcher.on('call', (call, audioPath) => {
    console.log(`Recording detected: TG ${call.talkgroup} - ${audioPath}`);

    // Save to database
    processCompletedCall(call, audioPath);

    // Broadcast new recording for auto-play
    broadcastServer.broadcastNewRecording({
      id: call.id,
      talkgroupId: call.talkgroup,
      alphaTag: call.talkgrouptag,
      groupName: call.talkgroupGroup,
      frequency: call.freq,
      startTime: call.startTime,
      stopTime: call.stopTime,
      duration: call.length,
      emergency: call.emergency,
      encrypted: call.encrypted,
      audioUrl: `/api/audio/${call.id}`,
    });
  });

  // Set up log watcher event handler
  logWatcher.on('event', (event) => {
    broadcastServer.broadcastControlChannel(event);
  });

  // Start services
  audioReceiver.start();
  fftReceiver.start();
  fileWatcher.start();
  logWatcher.start();

  // Start Fastify server
  await app.listen({ port: config.server.port, host: config.server.host });
  console.log(`Server listening on http://${config.server.host}:${config.server.port}`);
  console.log(`WebSocket available at ws://${config.server.host}:${config.server.port}/ws`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    trStatusServer.close();
    logWatcher.stop();
    audioReceiver.stop();
    fftReceiver.stop();
    fileWatcher.stop();
    await app.close();
    console.log('Server closed');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
