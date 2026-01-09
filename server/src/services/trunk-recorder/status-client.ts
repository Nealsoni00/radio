import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { TRStatusMessage, TRCallStart, TRCallEnd } from '../../types/index.js';

export interface StatusClientEvents {
  connected: () => void;
  disconnected: () => void;
  callStart: (call: TRCallStart) => void;
  callEnd: (call: TRCallEnd) => void;
  callsActive: (calls: TRCallStart[]) => void;
  rates: (rates: Record<string, { decoderate: number; control_channel: number }>) => void;
  error: (error: Error) => void;
}

export class TrunkRecorderClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectInterval = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(private url: string) {
    super();
  }

  connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    console.log(`Connecting to trunk-recorder at ${this.url}...`);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.isConnecting = false;
        console.log('Connected to trunk-recorder');
        this.emit('connected');
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message: TRStatusMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error('Failed to parse trunk-recorder message:', err);
        }
      });

      this.ws.on('close', () => {
        this.isConnecting = false;
        console.log('Disconnected from trunk-recorder');
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        this.isConnecting = false;
        console.error('trunk-recorder WebSocket error:', err.message);
        // Don't emit error to prevent crash - just schedule reconnect
        this.scheduleReconnect();
      });
    } catch (err) {
      this.isConnecting = false;
      console.error('Failed to connect to trunk-recorder:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect to trunk-recorder...');
      this.connect();
    }, this.reconnectInterval);
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

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
