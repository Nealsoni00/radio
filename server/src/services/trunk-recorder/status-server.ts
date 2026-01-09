import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { TRStatusMessage, TRCallStart, TRCallEnd } from '../../types/index.js';

export class TrunkRecorderStatusServer extends EventEmitter {
  private wss: WebSocketServer;
  private trConnection: WebSocket | null = null;

  constructor(port: number) {
    super();
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    console.log(`trunk-recorder status server listening on port ${port}`);
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('trunk-recorder connected to status server');
      this.trConnection = ws;
      this.emit('connected');

      ws.on('message', (data: Buffer) => {
        try {
          const message: TRStatusMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error('Failed to parse trunk-recorder message:', err);
        }
      });

      ws.on('close', () => {
        console.log('trunk-recorder disconnected from status server');
        this.trConnection = null;
        this.emit('disconnected');
      });

      ws.on('error', (err) => {
        console.error('trunk-recorder WebSocket error:', err.message);
      });
    });

    this.wss.on('error', (err) => {
      console.error('Status server error:', err);
    });
  }

  private handleMessage(message: TRStatusMessage): void {
    switch (message.type) {
      case 'call_start':
        if (message.call) {
          this.emit('callStart', message.call as TRCallStart);
        }
        break;
      case 'call_end':
        if (message.call) {
          this.emit('callEnd', message.call as TRCallEnd);
        }
        break;
      case 'calls_active':
        if (message.calls) {
          this.emit('callsActive', message.calls);
        }
        break;
      case 'rates':
        if (message.rates) {
          this.emit('rates', message.rates);
        }
        break;
      case 'systems':
        console.log('Received systems configuration from trunk-recorder');
        break;
      case 'recorders':
        console.log('Received recorders status from trunk-recorder');
        break;
      default:
        console.log('Unknown trunk-recorder message type:', (message as any).type);
    }
  }

  isConnected(): boolean {
    return this.trConnection !== null && this.trConnection.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.wss.close();
  }
}
