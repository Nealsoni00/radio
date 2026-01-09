import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { initializeDatabase, upsertTalkgroup, insertCall, insertCallSources } from './db/index.js';
import { TrunkRecorderClient } from './services/trunk-recorder/status-client.js';
import { AudioReceiver } from './services/trunk-recorder/audio-receiver.js';
import { FileWatcher } from './services/trunk-recorder/file-watcher.js';
import { BroadcastServer } from './services/broadcast/websocket.js';
import { callRoutes } from './routes/api/calls.js';
import { talkgroupRoutes } from './routes/api/talkgroups.js';
import { audioRoutes } from './routes/api/audio.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
    // Register API routes
    await app.register(callRoutes);
    await app.register(talkgroupRoutes);
    await app.register(audioRoutes);
    // Health check endpoint
    app.get('/api/health', async () => ({
        status: 'ok',
        timestamp: Date.now(),
        trunkRecorder: trClient.isConnected(),
        audioReceiver: audioReceiver.isListening(),
        clients: broadcastServer.getClientCount(),
    }));
    // Create HTTP server and start listening
    const httpServer = createServer(app.server);
    // Initialize broadcast server (WebSocket)
    const broadcastServer = new BroadcastServer(httpServer);
    // Initialize trunk-recorder status client
    const trClient = new TrunkRecorderClient(config.trunkRecorder.statusUrl);
    trClient.on('callStart', (call) => {
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
    trClient.on('callEnd', (call) => {
        console.log(`Call ended: TG ${call.talkgroup} (${call.talkgrouptag}) - ${call.length}s`);
        // Upsert talkgroup info
        upsertTalkgroup(call.talkgroup, call.talkgrouptag, call.talkgroupDescription, call.talkgroupGroup, call.talkgroupTag);
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
            audioFile: call.filename,
            audioType: call.audioType,
        });
        // Insert call sources
        if (call.srcList && call.srcList.length > 0) {
            insertCallSources(call.id, call.srcList);
        }
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
    trClient.on('callsActive', (calls) => {
        broadcastServer.broadcastActiveCalls(calls.map((call) => ({
            id: call.id,
            talkgroupId: call.talkgroup,
            alphaTag: call.talkgrouptag,
            frequency: call.freq,
        })));
    });
    trClient.on('rates', (rates) => {
        broadcastServer.broadcastRates(rates);
    });
    // Initialize audio receiver
    const audioReceiver = new AudioReceiver(config.trunkRecorder.audioPort);
    audioReceiver.on('audio', (packet) => {
        broadcastServer.broadcastAudio(packet);
    });
    // Initialize file watcher for recordings
    const fileWatcher = new FileWatcher(config.trunkRecorder.audioDir);
    fileWatcher.on('call', (call, audioPath) => {
        console.log(`Recording detected: TG ${call.talkgroup} - ${audioPath}`);
        // Upsert talkgroup
        upsertTalkgroup(call.talkgroup, call.talkgrouptag, call.talkgroupDescription, call.talkgroupGroup, call.talkgroupTag);
        // Insert call
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
        if (call.srcList && call.srcList.length > 0) {
            insertCallSources(call.id, call.srcList);
        }
    });
    // Start services
    trClient.connect();
    audioReceiver.start();
    fileWatcher.start();
    // Start HTTP server
    httpServer.listen(config.server.port, config.server.host, () => {
        console.log(`Server listening on http://${config.server.host}:${config.server.port}`);
        console.log(`WebSocket available at ws://${config.server.host}:${config.server.port}/ws`);
    });
    // Graceful shutdown
    const shutdown = () => {
        console.log('Shutting down...');
        trClient.disconnect();
        audioReceiver.stop();
        fileWatcher.stop();
        httpServer.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map