import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { initializeDatabase, upsertTalkgroup, insertCall, insertCallSources, getTalkgroup, getOrCreateChannel, getChannelByFrequency, isConventionalSystemFromDB, setSystemType, getAllSystemConfig, setSystemConfigValue, } from './db/index.js';
import { TrunkRecorderStatusServer } from './services/trunk-recorder/status-server.js';
import { AudioReceiver } from './services/trunk-recorder/audio-receiver.js';
import { FFTReceiver } from './services/trunk-recorder/fft-receiver.js';
import { FileWatcher } from './services/trunk-recorder/file-watcher.js';
import { LogWatcher } from './services/trunk-recorder/log-watcher.js';
import { BroadcastServer } from './services/broadcast/websocket.js';
import { callRoutes } from './routes/api/calls.js';
import { talkgroupRoutes } from './routes/api/talkgroups.js';
import { channelRoutes } from './routes/api/channels.js';
import { audioRoutes } from './routes/api/audio.js';
import { radioReferenceRoutes } from './routes/api/radioreference.js';
import { spectrumRoutes } from './routes/api/spectrum.js';
import { systemRoutes } from './routes/api/system.js';
import { systemManager } from './services/system/system-manager.js';
import { FFTRecorder } from './services/spectrum/fft-recorder.js';
import { FFTReplayer } from './services/spectrum/fft-replayer.js';
import { frequencyScanner } from './services/spectrum/frequency-scanner.js';
import { channelTracker } from './services/spectrum/channel-tracker.js';
import { detectRTLDevices } from './services/sdr/rtl-detect.js';
import { AvtecStreamer } from './services/avtec/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Check if the system is configured for conventional operation.
 * Conventional systems use fixed frequencies (channels) instead of talkgroups.
 * Reads from database so it can be changed from the portal without restart.
 */
function isConventionalSystem() {
    return isConventionalSystemFromDB();
}
/**
 * Normalize an audio file path from trunk-recorder.
 * trunk-recorder may send absolute paths, relative paths, or just filenames.
 * This function ensures we always have a full absolute path.
 */
function normalizeAudioPath(filename) {
    if (!filename)
        return null;
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
 * For trunked systems: {talkgroup}-{start_time}.wav
 * For conventional systems: {frequency}-{start_time}.wav
 */
function generateAudioPath(call) {
    const isConventional = isConventionalSystem();
    const callId = isConventional
        ? `${call.freq}-${call.startTime}`
        : `${call.talkgroup}-${call.startTime}`;
    return join(config.trunkRecorder.audioDir, `${callId}.wav`);
}
/**
 * Process a completed call: save to database and optionally broadcast.
 * Consolidates duplicate logic from callEnd and fileWatcher handlers.
 * Handles both trunked (talkgroup-based) and conventional (channel-based) systems.
 *
 * @param call - The call data from trunk-recorder
 * @param audioPath - The normalized audio file path
 * @param callId - Optional override for the call ID (defaults to talkgroup-startTime format)
 */
function processCompletedCall(call, audioPath, callId) {
    const isConventional = isConventionalSystem();
    if (isConventional) {
        // CONVENTIONAL SYSTEM: Use frequency/channel as the identifier
        // For conventional systems, the frequency IS the channel
        // The talkgroup may be 0 or may contain a P25 NAC/TG from the digital signal
        // Get or create a channel for this frequency
        const channelId = getOrCreateChannel(call.freq, call.talkgrouptag || `${(call.freq / 1e6).toFixed(4)} MHz`, call.talkgroupGroup);
        // Use frequency-based call ID for conventional systems
        const id = callId || `${call.freq}-${call.startTime}`;
        // Insert call record with channel reference
        insertCall({
            id,
            talkgroupId: call.talkgroup || 0, // May be 0 for conventional
            frequency: call.freq,
            startTime: call.startTime,
            stopTime: call.stopTime,
            duration: call.length,
            emergency: call.emergency,
            encrypted: call.encrypted,
            audioFile: audioPath,
            audioType: call.audioType,
            systemType: 'conventional',
            channelId,
        });
        // Insert call sources
        if (call.srcList && call.srcList.length > 0) {
            insertCallSources(id, call.srcList);
        }
    }
    else {
        // TRUNKED SYSTEM: Use talkgroup as the identifier (existing behavior)
        const id = callId || `${call.talkgroup}-${call.startTime}`;
        // Upsert talkgroup info
        upsertTalkgroup(call.talkgroup, call.talkgrouptag, call.talkgroupDescription, call.talkgroupGroup, call.talkgroupTag);
        // Insert call record with talkgroup reference
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
            systemType: 'trunked',
        });
        // Insert call sources
        if (call.srcList && call.srcList.length > 0) {
            insertCallSources(id, call.srcList);
        }
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
    await app.register(channelRoutes);
    await app.register(audioRoutes);
    await app.register(radioReferenceRoutes);
    await app.register(spectrumRoutes({ recorder: fftRecorder, replayer: fftReplayer }));
    await app.register(systemRoutes);
    // Variable to store broadcast server reference for health endpoint
    let broadcastServer = null;
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
    // System configuration endpoint (for client to know system type)
    app.get('/api/system/config', async () => {
        const allConfig = getAllSystemConfig();
        return {
            type: allConfig.system_type || 'p25',
            shortName: allConfig.system_short_name || 'default',
            isConventional: isConventionalSystem(),
        };
    });
    // Update system configuration
    app.put('/api/system/config', async (request) => {
        const body = request.body;
        if (body.type) {
            // Validate system type
            const validTypes = ['p25', 'conventional', 'p25_conventional', 'conventionalP25', 'conventionalDMR'];
            if (!validTypes.includes(body.type)) {
                throw new Error(`Invalid system type. Must be one of: ${validTypes.join(', ')}`);
            }
            setSystemType(body.type);
        }
        if (body.shortName) {
            setSystemConfigValue('system_short_name', body.shortName);
        }
        // Return updated config
        const allConfig = getAllSystemConfig();
        return {
            success: true,
            config: {
                type: allConfig.system_type || 'p25',
                shortName: allConfig.system_short_name || 'default',
                isConventional: isConventionalSystem(),
            },
        };
    });
    // RTL-SDR device detection endpoint
    app.get('/api/sdr/devices', async () => {
        return detectRTLDevices();
    });
    // Control channel events endpoint (for initial load)
    app.get('/api/control-channel', async (request) => {
        const { count = '100' } = request.query;
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
        const body = request.body;
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
    trStatusServer.on('callStart', (call) => {
        // Generate consistent call ID based on system type
        // For trunked: talkgroup-timestamp
        // For conventional: frequency-timestamp
        const startTime = Math.floor(Date.now() / 1000);
        const isConventional = isConventionalSystem();
        const consistentCallId = isConventional
            ? `${call.freq}-${startTime}`
            : `${call.talkgroup}-${startTime}`;
        // For conventional systems, use frequency as display name if no talkgroup tag
        const displayTag = call.talkgrouptag || (isConventional ? `${(call.freq / 1e6).toFixed(4)} MHz` : `TG ${call.talkgroup}`);
        console.log(`Call started: ${isConventional ? 'CH' : 'TG'} ${isConventional ? (call.freq / 1e6).toFixed(4) : call.talkgroup} (${displayTag}) ID: ${consistentCallId}`);
        // Track active call for spectrum markers
        channelTracker.addActiveCall({
            id: consistentCallId,
            frequency: call.freq,
            talkgroupId: call.talkgroup,
            alphaTag: displayTag,
        });
        broadcastServer.broadcastCallStart({
            id: consistentCallId,
            talkgroupId: isConventional ? call.freq : call.talkgroup, // Use freq as ID for conventional
            alphaTag: displayTag,
            frequency: call.freq,
            startTime: startTime,
            emergency: false,
            encrypted: false,
            systemType: (isConventional ? 'conventional' : 'trunked'),
        });
        // Stream to Avtec audio-client
        avtecStreamer.handleCallStart({
            id: consistentCallId,
            talkgroupId: isConventional ? call.freq : call.talkgroup,
            alphaTag: displayTag,
            frequency: call.freq,
            startTime: startTime,
            emergency: false,
        });
    });
    trStatusServer.on('callEnd', (call) => {
        const isConventional = isConventionalSystem();
        // For conventional systems, use frequency as display name if no talkgroup tag
        const displayTag = call.talkgrouptag || (isConventional ? `${(call.freq / 1e6).toFixed(4)} MHz` : `TG ${call.talkgroup}`);
        console.log(`Call ended: ${isConventional ? 'CH' : 'TG'} ${isConventional ? (call.freq / 1e6).toFixed(4) : call.talkgroup} (${displayTag}) - ${call.length}s`);
        // Normalize the audio file path, or generate it if not provided
        let audioPath = normalizeAudioPath(call.filename);
        if (!audioPath) {
            audioPath = generateAudioPath(call);
            console.log(`  → No filename provided, generated: "${audioPath}"`);
        }
        console.log(`  → Raw filename: "${call.filename}"`);
        console.log(`  → Final audioPath: "${audioPath}"`);
        console.log(`  → call ID: "${call.id}"`);
        // Generate a consistent call ID based on system type
        // For trunked: talkgroup-startTime
        // For conventional: frequency-startTime
        const consistentCallId = isConventional
            ? `${call.freq}-${call.startTime}`
            : `${call.talkgroup}-${call.startTime}`;
        // Remove from active calls for spectrum markers
        channelTracker.removeCall(call.id);
        // Save to database with normalized path and consistent ID
        processCompletedCall(call, audioPath, consistentCallId);
        // Broadcast to clients using consistent call ID
        const broadcastPayload = {
            id: consistentCallId,
            talkgroupId: isConventional ? call.freq : call.talkgroup, // Use freq as ID for conventional
            alphaTag: displayTag,
            groupName: call.talkgroupGroup,
            groupTag: call.talkgroupTag,
            frequency: call.freq,
            startTime: call.startTime,
            stopTime: call.stopTime,
            duration: call.length,
            emergency: call.emergency,
            encrypted: call.encrypted,
            audioFile: audioPath,
            systemType: (isConventional ? 'conventional' : 'trunked'),
        };
        console.log(`  → Broadcasting callEnd with ID: "${consistentCallId}", audioFile: "${audioPath}"`);
        broadcastServer.broadcastCallEnd(broadcastPayload);
        // Notify Avtec streamer of call end (pass talkgroup for fallback matching)
        const talkgroupIdForAvtec = isConventional ? call.freq : call.talkgroup;
        avtecStreamer.handleCallEnd(consistentCallId, talkgroupIdForAvtec);
    });
    trStatusServer.on('callsActive', (calls) => {
        const isConventional = isConventionalSystem();
        // Update channel tracker with full list of active calls
        channelTracker.updateActiveCalls(calls.map((call) => {
            const displayTag = call.talkgrouptag || (isConventional ? `${(call.freq / 1e6).toFixed(4)} MHz` : `TG ${call.talkgroup}`);
            return {
                id: call.id,
                frequency: call.freq,
                talkgroupId: call.talkgroup,
                alphaTag: displayTag,
            };
        }));
        broadcastServer.broadcastActiveCalls(calls.map((call) => {
            const displayTag = call.talkgrouptag || (isConventional ? `${(call.freq / 1e6).toFixed(4)} MHz` : `TG ${call.talkgroup}`);
            return {
                id: call.id,
                talkgroupId: isConventional ? call.freq : call.talkgroup,
                alphaTag: displayTag,
                frequency: call.freq,
                systemType: (isConventional ? 'conventional' : 'trunked'),
            };
        }));
    });
    trStatusServer.on('rates', (rates) => {
        broadcastServer.broadcastRates(rates);
    });
    // Cache for talkgroup/channel lookups (refreshes every 60 seconds)
    const metadataCache = new Map();
    const METADATA_CACHE_TTL = 60000; // 60 seconds
    audioReceiver.on('audio', (packet) => {
        // Enrich packet with talkgroup/channel info from database
        const now = Date.now();
        const isConventional = isConventionalSystem();
        // For conventional systems, use frequency as the cache key
        // For trunked systems, use talkgroup ID
        const cacheKey = isConventional ? packet.metadata?.freq || packet.talkgroupId : packet.talkgroupId;
        let cached = metadataCache.get(cacheKey);
        if (!cached || now - cached.cachedAt > METADATA_CACHE_TTL) {
            if (isConventional) {
                // Look up channel by frequency
                const freq = packet.metadata?.freq || 0;
                const ch = getChannelByFrequency(freq);
                cached = {
                    alphaTag: ch?.alpha_tag || `${(freq / 1e6).toFixed(4)} MHz`,
                    groupName: ch?.group_name ?? undefined,
                    groupTag: ch?.group_tag ?? undefined,
                    description: ch?.description ?? undefined,
                    cachedAt: now,
                };
            }
            else {
                // Look up talkgroup by ID (existing behavior)
                const tg = getTalkgroup(packet.talkgroupId);
                cached = {
                    alphaTag: tg?.alpha_tag,
                    groupName: tg?.group_name ?? undefined,
                    groupTag: tg?.group_tag ?? undefined,
                    description: tg?.description ?? undefined,
                    cachedAt: now,
                };
            }
            metadataCache.set(cacheKey, cached);
        }
        // Add talkgroup/channel info to metadata
        const enrichedPacket = {
            ...packet,
            metadata: {
                ...packet.metadata,
                alphaTag: cached.alphaTag,
                groupName: cached.groupName,
                groupTag: cached.groupTag,
                talkgroupDescription: cached.description,
                systemType: isConventional ? 'conventional' : 'trunked',
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
//# sourceMappingURL=index.js.map