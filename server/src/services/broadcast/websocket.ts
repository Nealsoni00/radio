import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type { ClientMessage, ServerMessage, Call, AudioPacket } from '../../types/index.js';

interface Client {
  id: string;
  ws: WebSocket;
  subscribedTalkgroups: Set<number>;
  streamAudio: boolean;
}

export class BroadcastServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupHandlers();
    console.log('WebSocket broadcast server initialized');
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const clientId = this.generateClientId();

      const client: Client = {
        id: clientId,
        ws,
        subscribedTalkgroups: new Set(),
        streamAudio: false,
      };

      this.clients.set(clientId, client);
      console.log(`Client connected: ${clientId} (total: ${this.clients.size})`);

      ws.on('message', (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (err) {
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

  private handleClientMessage(clientId: string, message: ClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

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
    }
  }

  private sendToClient(clientId: string, message: ServerMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private isSubscribed(client: Client, talkgroupId: number): boolean {
    // Empty set = subscribed to all
    return client.subscribedTalkgroups.size === 0 || client.subscribedTalkgroups.has(talkgroupId);
  }

  broadcastCallStart(call: Partial<Call>): void {
    const message: ServerMessage = { type: 'callStart', call };
    const json = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      if (!this.isSubscribed(client, call.talkgroupId!)) return;

      client.ws.send(json);
    });
  }

  broadcastCallEnd(call: Partial<Call>): void {
    const message: ServerMessage = { type: 'callEnd', call };
    const json = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      if (!this.isSubscribed(client, call.talkgroupId!)) return;

      client.ws.send(json);
    });
  }

  // Broadcast new recording for auto-play
  broadcastNewRecording(call: Partial<Call> & { audioUrl?: string }): void {
    const message: ServerMessage = { type: 'newRecording', call };
    const json = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      if (!client.streamAudio) return;
      if (!this.isSubscribed(client, call.talkgroupId!)) return;

      client.ws.send(json);
    });
  }

  broadcastActiveCalls(calls: Partial<Call>[]): void {
    const message: ServerMessage = { type: 'callsActive', calls };
    const json = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      client.ws.send(json);
    });
  }

  broadcastRates(rates: Record<string, { decoderate: number }>): void {
    const message: ServerMessage = { type: 'rates', rates };
    const json = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      client.ws.send(json);
    });
  }

  broadcastAudio(packet: AudioPacket): void {
    // Build binary message: [4 bytes header length][JSON header][PCM data]
    const header = Buffer.from(
      JSON.stringify({
        type: 'audio',
        talkgroupId: packet.talkgroupId,
        ...packet.metadata,
      })
    );
    const headerLen = Buffer.alloc(4);
    headerLen.writeUInt32LE(header.length, 0);
    const message = Buffer.concat([headerLen, header, packet.pcmData]);

    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      if (!client.streamAudio) return;
      if (!this.isSubscribed(client, packet.talkgroupId)) return;

      client.ws.send(message);
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
