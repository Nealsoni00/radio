import { WebSocket, WebSocketServer } from 'ws';
export class BroadcastServer {
    wss;
    clients = new Map();
    constructor(server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });
        this.setupHandlers();
        console.log('WebSocket broadcast server initialized');
    }
    setupHandlers() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            const client = {
                id: clientId,
                ws,
                subscribedTalkgroups: new Set(),
                streamAudio: false,
                streamFFT: false,
            };
            this.clients.set(clientId, client);
            console.log(`Client connected: ${clientId} (total: ${this.clients.size})`);
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleClientMessage(clientId, message);
                }
                catch (err) {
                    console.error(`Invalid message from client ${clientId}:`, err);
                }
            });
            ws.on('close', () => {
                this.clients.delete(clientId);
                console.log(`Client disconnected: ${clientId} (total: ${this.clients.size})`);
            });
            ws.on('error', (err) => {
                console.error(`WebSocket error for client ${clientId}:`, err);
            });
            // Send initial connection message
            this.sendToClient(clientId, { type: 'connected', clientId });
        });
    }
    handleClientMessage(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        switch (message.type) {
            case 'subscribe':
                if (message.talkgroups) {
                    message.talkgroups.forEach((tg) => client.subscribedTalkgroups.add(tg));
                    console.log(`Client ${clientId} subscribed to ${message.talkgroups.length} talkgroups`);
                }
                break;
            case 'unsubscribe':
                if (message.talkgroups) {
                    message.talkgroups.forEach((tg) => client.subscribedTalkgroups.delete(tg));
                }
                break;
            case 'subscribeAll':
                client.subscribedTalkgroups.clear();
                console.log(`Client ${clientId} subscribed to all talkgroups`);
                break;
            case 'enableAudio':
                client.streamAudio = message.enabled ?? false;
                console.log(`Client ${clientId} audio streaming: ${client.streamAudio}`);
                break;
            case 'enableFFT':
                client.streamFFT = message.enabled ?? false;
                console.log(`Client ${clientId} FFT streaming: ${client.streamFFT}`);
                break;
        }
    }
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
    isSubscribed(client, talkgroupId) {
        // Empty set = subscribed to all
        return client.subscribedTalkgroups.size === 0 || client.subscribedTalkgroups.has(talkgroupId);
    }
    broadcastCallStart(call) {
        const message = { type: 'callStart', call };
        const json = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            if (!this.isSubscribed(client, call.talkgroupId))
                return;
            client.ws.send(json);
        });
    }
    broadcastCallEnd(call) {
        const message = { type: 'callEnd', call };
        const json = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            if (!this.isSubscribed(client, call.talkgroupId))
                return;
            client.ws.send(json);
        });
    }
    // Broadcast new recording for auto-play
    broadcastNewRecording(call) {
        const message = { type: 'newRecording', call };
        const json = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            if (!client.streamAudio)
                return;
            if (!this.isSubscribed(client, call.talkgroupId))
                return;
            client.ws.send(json);
        });
    }
    broadcastActiveCalls(calls) {
        const message = { type: 'callsActive', calls };
        const json = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            client.ws.send(json);
        });
    }
    broadcastRates(rates) {
        const message = { type: 'rates', rates };
        const json = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            client.ws.send(json);
        });
    }
    broadcastAudio(packet) {
        // Build binary message: [4 bytes header length][JSON header][PCM data]
        const header = Buffer.from(JSON.stringify({
            type: 'audio',
            talkgroupId: packet.talkgroupId,
            ...packet.metadata,
        }));
        const headerLen = Buffer.alloc(4);
        headerLen.writeUInt32LE(header.length, 0);
        const message = Buffer.concat([headerLen, header, packet.pcmData]);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            if (!client.streamAudio)
                return;
            if (!this.isSubscribed(client, packet.talkgroupId))
                return;
            client.ws.send(message);
        });
    }
    broadcastFFT(packet) {
        // Build binary message: [4 bytes header length][JSON header][Float32 FFT data]
        const header = Buffer.from(JSON.stringify({
            type: 'fft',
            sourceIndex: packet.sourceIndex,
            centerFreq: packet.centerFreq,
            sampleRate: packet.sampleRate,
            timestamp: packet.timestamp,
            fftSize: packet.fftSize,
            minFreq: packet.minFreq,
            maxFreq: packet.maxFreq,
        }));
        const headerLen = Buffer.alloc(4);
        headerLen.writeUInt32LE(header.length, 0);
        // Convert Float32Array to Buffer
        const fftBuffer = Buffer.from(packet.magnitudes.buffer);
        const message = Buffer.concat([headerLen, header, fftBuffer]);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            if (!client.streamFFT)
                return;
            client.ws.send(message);
        });
    }
    broadcastControlChannel(event) {
        const message = {
            type: 'controlChannel',
            event: {
                ...event,
                timestamp: event.timestamp.toISOString(),
            },
        };
        const json = JSON.stringify(message);
        this.clients.forEach((client) => {
            if (client.ws.readyState !== WebSocket.OPEN)
                return;
            client.ws.send(json);
        });
    }
    getClientCount() {
        return this.clients.size;
    }
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
//# sourceMappingURL=websocket.js.map