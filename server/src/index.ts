import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createServer } from 'http';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/index.js';
import { initializeDatabase, upsertTalkgroup, insertCall, insertCallSources, getTalkgroup } from './db/index.js';
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
import { systemRoutes } from './routes/api/system.js';
import { systemManager } from './services/system/system-manager.js';
import { FFTRecorder } from './services/spectrum/fft-recorder.js';
import { FFTReplayer } from './services/spectrum/fft-replayer.js';
import { frequencyScanner } from './services/spectrum/frequency-scanner.js';
import { channelTracker } from './services/spectrum/channel-tracker.js';
import type { TRCallStart, TRCallEnd } from './types/index.js';
import { detectRTLDevices } from './services/sdr/rtl-detect.js';
import { AvtecStreamer } from './services/avtec/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Normalize an audio file path from trunk-recorder.
 * trunk-recorder may send absolute paths, relative paths, or just filenames.
 * This function ensures we always have a full absolute path.
 */
function normalizeAudioPath(filename: string | undefined | null): string | null {
  if (!filename) return null;

  // If it's already an absolute path, use it as-is
  if (isAbsolute(filename)) {
    return filename;
  }

  // Otherwise, join with the audio directory from config
  return join(config.trunkRecorder.audioDir, filename);
}

/**
 * Generate the expected audio file path for a call based on its metadata.
 * This is used as a fallback when trunk-recorder doesn't provide the filename.
 *
 * trunk-recorder naming convention: {talkgroup}-{start_time}_{frequency}-call_{N}.wav
 * But the simpler format is: {talkgroup}-{start_time}.wav
 */
function generateAudioPath(call: TRCallEnd): string {
  const callId = `${call.talkgroup}-${call.startTime}`;
  return join(config.trunkRecorder.audioDir, `${callId}.wav`);
}

/**
 * Process a completed call: save to database and optionally broadcast.
 * Consolidates duplicate logic from callEnd and fileWatcher handlers.
 *
 * @param call - The call data from trunk-recorder
 * @param audioPath - The normalized audio file path
 * @param callId - Optional override for the call ID (defaults to talkgroup-startTime format)
 */
function processCompletedCall(
  call: TRCallEnd,
  audioPath: string,
  callId?: string
): void {
  // Use consistent call ID format: talkgroup-startTime
  const id = callId || `${call.talkgroup}-${call.startTime}`;

  // Upsert talkgroup info
  upsertTalkgroup(
    call.talkgroup,
    call.talkgrouptag,
    call.talkgroupDescription,
    call.talkgroupGroup,
    call.talkgroupTag
  );

  // Insert call record with consistent ID
  insertCall({
    id,
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
    insertCallSources(id, call.srcList);
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
  // Try the output log first (used by `just start`), fall back to direct log
  const trLogPath = (await import('fs')).existsSync('/tmp/trunk-recorder-output.log')
    ? '/tmp/trunk-recorder-output.log'
    : '/tmp/trunk-recorder.log';
  const logWatcher = new LogWatcher(trLogPath);

  // Initialize Avtec streamer for streaming to Prepared911 audio-client
  const avtecStreamer = new AvtecStreamer({
    targetHost: process.env.AVTEC_HOST || '127.0.0.1',
    targetPort: parseInt(process.env.AVTEC_PORT || '50911'),
    enabled: process.env.AVTEC_ENABLED !== 'false',
  });

  // Register API routes
  await app.register(callRoutes);
  await app.register(talkgroupRoutes);
  await app.register(audioRoutes);
  await app.register(radioReferenceRoutes);
  await app.register(spectrumRoutes({ recorder: fftRecorder, replayer: fftReplayer }));
  await app.register(systemRoutes);

  // Variable to store broadcast server reference for health endpoint
  let broadcastServer: BroadcastServer | null = null;

  // Health check endpoint
  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: Date.now(),
    trunkRecorder: trStatusServer.isConnected() || fileWatcher.isWatching(),
    fileWatcher: fileWatcher.isWatching(),
    fileWatcherActive: fileWatcher.isActive(),
    audioReceiver: audioReceiver.isListening(),
    clients: broadcastServer?.getClientCount() ?? 0,
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

  // RTL-SDR device detection endpoint
  app.get('/api/sdr/devices', async () => {
    return detectRTLDevices();
  });

  // Control channel events endpoint (for initial load)
  app.get('/api/control-channel', async (request) => {
    const { count = '100' } = request.query as { count?: string };
    const events = await logWatcher.getRecentEvents(parseInt(count, 10));
    return { events };
  });

  // Avtec integration endpoints
  app.get('/api/avtec/status', async () => {
    return avtecStreamer.getStatus();
  });

  app.get('/api/avtec/config', async () => {
    return avtecStreamer.getConfig();
  });

  app.put('/api/avtec/config', async (request) => {
    const body = request.body as {
      targetHost?: string;
      targetPort?: number;
      enabled?: boolean;
    };

    // Validate
    if (body.targetPort !== undefined && (body.targetPort < 1 || body.targetPort > 65535)) {
      throw new Error('Invalid port number');
    }

    await avtecStreamer.updateConfig(body);
    return { success: true, config: avtecStreamer.getConfig() };
  });

  app.post('/api/avtec/reset-stats', async () => {
    avtecStreamer.resetStats();
    return { success: true };
  });

  // Ensure Fastify is ready before creating HTTP server
  await app.ready();

  // Create HTTP server from Fastify's server
  const httpServer = app.server;

  // Initialize broadcast server (WebSocket)
  broadcastServer = new BroadcastServer(httpServer);

  // Initialize channel tracker with control channels from config
  channelTracker.setControlChannels(config.sdr.controlChannels);
  console.log(`Channel tracker initialized with control channels: ${config.sdr.controlChannels.map((f) => (f / 1e6).toFixed(6)).join(', ')} MHz`);

  // Wire up system manager events for broadcasting system changes
  systemManager.on('systemChanged', (system) => {
    broadcastServer.broadcastSystemChanged(system);
    // Update channel tracker with new control channels
    if (system) {
      channelTracker.setControlChannels(system.controlChannels);
    }
  });

  trStatusServer.on('callStart', (call: TRCallStart) => {
    // Generate consistent call ID based on talkgroup and current timestamp
    // This will be close to the start_time that callEnd will have
    const startTime = Math.floor(Date.now() / 1000);
    const consistentCallId = `${call.talkgroup}-${startTime}`;

    console.log(`Call started: TG ${call.talkgroup} (${call.talkgrouptag}) ID: ${consistentCallId}`);

    // Track active call for spectrum markers
    channelTracker.addActiveCall({
      id: consistentCallId,
      frequency: call.freq,
      talkgroupId: call.talkgroup,
      alphaTag: call.talkgrouptag,
    });

    broadcastServer.broadcastCallStart({
      id: consistentCallId,
      talkgroupId: call.talkgroup,
      alphaTag: call.talkgrouptag,
      frequency: call.freq,
      startTime: startTime,
      emergency: false,
      encrypted: false,
    });

    // Stream to Avtec audio-client
    avtecStreamer.handleCallStart({
      id: consistentCallId,
      talkgroupId: call.talkgroup,
      alphaTag: call.talkgrouptag,
      frequency: call.freq,
      startTime: startTime,
      emergency: false,
    });
  });

  trStatusServer.on('callEnd', (call: TRCallEnd) => {
    console.log(`Call ended: TG ${call.talkgroup} (${call.talkgrouptag}) - ${call.length}s`);

    // Normalize the audio file path, or generate it if not provided
    let audioPath = normalizeAudioPath(call.filename);
    if (!audioPath) {
      audioPath = generateAudioPath(call);
      console.log(`  → No filename provided, generated: "${audioPath}"`);
    }
    console.log(`  → Raw filename: "${call.filename}"`);
    console.log(`  → Final audioPath: "${audioPath}"`);
    console.log(`  → call ID: "${call.id}"`);

    // Generate a consistent call ID based on talkgroup and start_time
    // This ensures callStart and callEnd can be matched even if trunk-recorder
    // sends different IDs
    const consistentCallId = `${call.talkgroup}-${call.startTime}`;

    // Remove from active calls for spectrum markers
    channelTracker.removeCall(call.id);

    // Save to database with normalized path and consistent ID
    processCompletedCall(call, audioPath, consistentCallId);

    // Broadcast to clients using consistent call ID
    const broadcastPayload = {
      id: consistentCallId,
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
      audioFile: audioPath,
    };
    console.log(`  → Broadcasting callEnd with ID: "${consistentCallId}", audioFile: "${audioPath}"`);
    broadcastServer.broadcastCallEnd(broadcastPayload);

    // Notify Avtec streamer of call end
    avtecStreamer.handleCallEnd(consistentCallId);
  });

  trStatusServer.on('callsActive', (calls: TRCallStart[]) => {
    // Update channel tracker with full list of active calls
    channelTracker.updateActiveCalls(
      calls.map((call) => ({
        id: call.id,
        frequency: call.freq,
        talkgroupId: call.talkgroup,
        alphaTag: call.talkgrouptag,
      }))
    );

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

  // Cache for talkgroup lookups (refreshes every 60 seconds)
  const talkgroupCache = new Map<number, { alphaTag?: string; groupName?: string; groupTag?: string; description?: string; cachedAt: number }>();
  const TALKGROUP_CACHE_TTL = 60000; // 60 seconds

  audioReceiver.on('audio', (packet) => {
    // Enrich packet with talkgroup info from database
    const now = Date.now();
    let cached = talkgroupCache.get(packet.talkgroupId);

    if (!cached || now - cached.cachedAt > TALKGROUP_CACHE_TTL) {
      const tg = getTalkgroup(packet.talkgroupId);
      cached = {
        alphaTag: tg?.alpha_tag,
        groupName: tg?.group_name ?? undefined,
        groupTag: tg?.group_tag ?? undefined,
        description: tg?.description ?? undefined,
        cachedAt: now,
      };
      talkgroupCache.set(packet.talkgroupId, cached);
    }

    // Add talkgroup info to metadata
    const enrichedPacket = {
      ...packet,
      metadata: {
        ...packet.metadata,
        alphaTag: cached.alphaTag,
        groupName: cached.groupName,
        groupTag: cached.groupTag,
        talkgroupDescription: cached.description,
      },
    };

    broadcastServer.broadcastAudio(enrichedPacket);

    // Stream audio to Avtec audio-client (expects 16-bit PCM at 8000 Hz)
    // pcmData is already a Buffer, pass it directly
    if (packet.pcmData && packet.pcmData.length > 0) {
      avtecStreamer.handleAudioPacket(packet.talkgroupId, packet.pcmData);
    }
  });

  fftReceiver.on('fft', (packet) => {
    // Broadcast live FFT to clients
    broadcastServer.broadcastFFT(packet);
    // Also record if recording is active
    fftRecorder.addPacket(packet);
    // Update frequency scanner with latest FFT data
    frequencyScanner.updateFFT(packet);
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
      groupTag: call.talkgroupTag,
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
    // Also record control channel events if recording
    fftRecorder.addControlChannelEvent(event);
  });

  // Start services
  audioReceiver.start();
  fftReceiver.start();
  fileWatcher.start();
  logWatcher.start();
  await avtecStreamer.start();

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
    avtecStreamer.stop();
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
