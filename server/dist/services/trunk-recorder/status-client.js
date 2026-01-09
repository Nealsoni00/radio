import WebSocket from 'ws';
import { EventEmitter } from 'events';
export class TrunkRecorderClient extends EventEmitter {
    url;
    ws = null;
    reconnectInterval = 5000;
    reconnectTimer = null;
    isConnecting = false;
    constructor(url) {
        super();
        this.url = url;
    }
    connect() {
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
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                }
                catch (err) {
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
                this.emit('error', err);
            });
        }
        catch (err) {
            this.isConnecting = false;
            console.error('Failed to connect to trunk-recorder:', err);
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => {
            console.log('Attempting to reconnect to trunk-recorder...');
            this.connect();
        }, this.reconnectInterval);
    }
    handleMessage(message) {
        switch (message.type) {
            case 'call_start':
                if (message.call) {
                    this.emit('callStart', message.call);
                }
                break;
            case 'call_end':
                if (message.call) {
                    this.emit('callEnd', message.call);
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
                console.log('Unknown trunk-recorder message type:', message.type);
        }
    }
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}
//# sourceMappingURL=status-client.js.map