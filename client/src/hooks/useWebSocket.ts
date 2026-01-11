import { useEffect, useCallback } from 'react';
import { useCallsStore, useConnectionStore, useAudioStore, useControlChannelStore } from '../store';
import { useFFTStore } from '../store/fft';
import { useSystemStore } from '../store/system';
import type { ServerMessage, ClientMessage, Call } from '../types';

// Singleton WebSocket manager - shared across all components
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private connectionCount = 0;
  private pendingMessages: ClientMessage[] = [];

  getSocket(): WebSocket | null {
    return this.ws;
  }

  connect(): void {
    this.connectionCount++;

    // Only create connection once
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      useConnectionStore.getState().setConnected(true);
      // Subscribe to all talkgroups by default
      ws.send(JSON.stringify({ type: 'subscribeAll' } as ClientMessage));

      // Send any pending messages that were queued while connecting
      if (this.pendingMessages.length > 0) {
        console.log(`[WS] Sending ${this.pendingMessages.length} pending messages`);
        this.pendingMessages.forEach(msg => {
          console.log('[WS] Sending queued message:', msg.type);
          ws.send(JSON.stringify(msg));
        });
        this.pendingMessages = [];
      }
    };

    ws.onmessage = (event) => {
      console.log('WS message received, type:', typeof event.data, 'isBlob:', event.data instanceof Blob);

      // Handle binary data (audio or FFT)
      if (event.data instanceof Blob) {
        console.log('Processing Blob, size:', event.data.size);
        event.data.arrayBuffer().then((buffer) => {
          this.handleBinaryData(buffer);
        });
        return;
      }

      // Handle JSON messages
      try {
        const message: ServerMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      useConnectionStore.getState().setConnected(false);
      this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    this.ws = ws;
  }

  disconnect(): void {
    this.connectionCount--;
    // Only close if no more components are using it
    if (this.connectionCount <= 0) {
      this.connectionCount = 0;
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.ws?.close();
      this.ws = null;
    }
  }

  send(message: ClientMessage): void {
    console.log('[WS] Sending message:', message.type, 'readyState:', this.ws?.readyState);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('[WS] Message sent successfully');
    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
      // Queue message to be sent when connection opens
      console.log('[WS] Connection not ready, queueing message:', message.type);
      this.pendingMessages.push(message);
    } else {
      console.warn('[WS] Cannot send - WebSocket not open, state:', this.ws?.readyState);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.connectionCount > 0) {
      this.reconnectTimeout = window.setTimeout(() => {
        console.log('Attempting to reconnect...');
        this.connect();
      }, 3000);
    }
  }

  private handleMessage(message: ServerMessage): void {
    const { addCall, updateCall, setActiveCalls } = useCallsStore.getState();
    const { setDecodeRate } = useConnectionStore.getState();
    const { setPlaying, setCurrentTalkgroup, addToQueue } = useAudioStore.getState();
    const { addEvent: addControlChannelEvent } = useControlChannelStore.getState();
    const { setActiveSystem } = useSystemStore.getState();

    switch (message.type) {
      case 'connected':
        console.log('Connected with client ID:', message.clientId);
        break;

      case 'callStart':
        if (message.call) {
          const call = transformCall(message.call);
          addCall(call);
          setCurrentTalkgroup(call.talkgroup_id);
          setPlaying(true);
        }
        break;

      case 'callEnd':
        if (message.call) {
          console.log('[WS] callEnd received:', {
            id: message.call.id,
            audioFile: (message.call as any).audioFile,
            audio_file: message.call.audio_file,
          });
          const call = transformCall(message.call);
          console.log('[WS] callEnd transformed:', {
            id: call.id,
            audio_file: call.audio_file,
          });

          // Find the matching call - try exact ID first, then fall back to talkgroup
          const callsState = useCallsStore.getState();
          const existingByExactId = callsState.calls.find((c) => c.id === call.id);
          const existingByTalkgroup = callsState.activeCalls.find(
            (c) => c.talkgroup_id === call.talkgroup_id
          );
          const existingCall = existingByExactId || existingByTalkgroup;

          console.log('[WS] callEnd matching:', {
            exactIdMatch: existingByExactId?.id,
            talkgroupMatch: existingByTalkgroup?.id,
            usingId: existingCall?.id,
          });

          if (existingCall) {
            // Update the existing call with the new data
            updateCall(existingCall.id, { ...call, id: existingCall.id });
          } else {
            // No existing call found, add it as a new completed call
            addCall({ ...call, isActive: false });
          }
          setPlaying(false);
        }
        break;

      case 'callsActive':
        if (message.calls) {
          setActiveCalls(message.calls.map(transformCall));
        }
        break;

      case 'newRecording':
        if (message.call) {
          const call = transformCall(message.call);
          const callsState = useCallsStore.getState();

          // Check if this call already exists as active - if so, update it
          const existingActive = callsState.activeCalls.find(
            (c) => c.id === call.id || c.talkgroup_id === call.talkgroup_id
          );

          if (existingActive) {
            // Update existing active call to mark it complete
            updateCall(existingActive.id, { ...call, isActive: false });
          } else {
            // Add as a completed call (not active since it has audio file)
            addCall({ ...call, isActive: false });
          }

          // Access store state directly to avoid stale closures
          const audioState = useAudioStore.getState();
          if (audioState.isLiveEnabled) {
            const tgId = message.call.talkgroupId || (message.call as any).talkgroup_id;
            // Check if this talkgroup is in our streaming selection
            // Empty set = all talkgroups
            const shouldQueue = audioState.streamingTalkgroups.size === 0 || audioState.streamingTalkgroups.has(tgId);
            if (shouldQueue && message.call.audioUrl) {
              console.log('Queueing new recording:', message.call.id, 'TG:', tgId);
              addToQueue({
                id: message.call.id || '',
                talkgroupId: tgId,
                alphaTag: message.call.alphaTag || (message.call as any).alpha_tag,
                audioUrl: message.call.audioUrl,
                duration: message.call.duration ?? undefined,
              });
            }
          }
        }
        break;

      case 'rates':
        if (message.rates) {
          const firstRate = Object.values(message.rates)[0];
          if (firstRate) {
            setDecodeRate(firstRate.decoderate);
          }
        }
        break;

      case 'controlChannel':
        if (message.event) {
          addControlChannelEvent(message.event);
        }
        break;

      case 'systemChanged':
        console.log('System changed via WebSocket:', message.system);
        setActiveSystem(message.system ?? null);
        break;

      case 'error':
        console.error('Server error:', message.error);
        break;
    }
  }

  private handleBinaryData(buffer: ArrayBuffer): void {
    const { updateFFT: updateFFTData } = useFFTStore.getState();

    console.log('Binary data received, size:', buffer.byteLength);

    // Parse header length (first 4 bytes, little-endian)
    const view = new DataView(buffer);
    const headerLen = view.getUint32(0, true);

    // Parse JSON header
    const headerBytes = new Uint8Array(buffer, 4, headerLen);
    const headerStr = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerStr);

    console.log('Binary header type:', header.type);

    if (header.type === 'fft') {
      // Handle FFT data - copy to aligned buffer since offset may not be 4-byte aligned
      const fftDataStart = 4 + headerLen;
      const fftDataBytes = new Uint8Array(buffer, fftDataStart);
      const alignedBuffer = new ArrayBuffer(fftDataBytes.length);
      new Uint8Array(alignedBuffer).set(fftDataBytes);
      const magnitudes = new Float32Array(alignedBuffer);

      // Log min/max values to debug scaling
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < magnitudes.length; i++) {
        if (magnitudes[i] < min) min = magnitudes[i];
        if (magnitudes[i] > max) max = magnitudes[i];
      }
      console.log('FFT data parsed, bins:', magnitudes.length, 'min:', min.toFixed(1), 'max:', max.toFixed(1));
      updateFFTData({
        sourceIndex: header.sourceIndex,
        centerFreq: header.centerFreq,
        sampleRate: header.sampleRate,
        timestamp: header.timestamp,
        fftSize: header.fftSize,
        minFreq: header.minFreq,
        maxFreq: header.maxFreq,
        magnitudes,
      });
    } else {
      // Handle audio data - copy to aligned buffer since offset may not be 2-byte aligned
      const audioDataStart = 4 + headerLen;
      const audioDataBytes = new Uint8Array(buffer, audioDataStart);
      const alignedBuffer = new ArrayBuffer(audioDataBytes.length);
      new Uint8Array(alignedBuffer).set(audioDataBytes);
      const pcmData = new Int16Array(alignedBuffer);

      // Dispatch audio event for the audio player to handle
      window.dispatchEvent(
        new CustomEvent('audioChunk', {
          detail: {
            talkgroupId: header.talkgroupId,
            pcmData,
            metadata: header,
          },
        })
      );
    }
  }
}

// Create singleton instance
const wsManager = new WebSocketManager();

export function useWebSocket() {
  useEffect(() => {
    wsManager.connect();
    return () => wsManager.disconnect();
  }, []);

  const subscribe = useCallback((talkgroups: number[]) => {
    wsManager.send({ type: 'subscribe', talkgroups });
  }, []);

  const unsubscribe = useCallback((talkgroups: number[]) => {
    wsManager.send({ type: 'unsubscribe', talkgroups });
  }, []);

  const subscribeAll = useCallback(() => {
    wsManager.send({ type: 'subscribeAll' });
  }, []);

  const enableAudio = useCallback((enabled: boolean) => {
    console.log('enableAudio called:', enabled);
    wsManager.send({ type: 'enableAudio', enabled });
  }, []);

  const enableFFT = useCallback((enabled: boolean) => {
    console.log('enableFFT called:', enabled);
    wsManager.send({ type: 'enableFFT', enabled });
  }, []);

  return {
    subscribe,
    unsubscribe,
    subscribeAll,
    enableAudio,
    enableFFT,
  };
}

function transformCall(call: Partial<Call>): Call {
  return {
    id: call.id || '',
    talkgroup_id: call.talkgroup_id || (call as any).talkgroupId || 0,
    frequency: call.frequency || 0,
    start_time: call.start_time || (call as any).startTime || 0,
    stop_time: call.stop_time ?? (call as any).stopTime ?? null,
    duration: call.duration ?? null,
    emergency: call.emergency || false,
    encrypted: call.encrypted || false,
    audio_file: call.audio_file ?? (call as any).audioFile ?? null,
    audio_type: call.audio_type ?? null,
    alpha_tag: call.alpha_tag ?? (call as any).alphaTag,
    group_name: call.group_name ?? (call as any).groupName,
    group_tag: call.group_tag ?? (call as any).groupTag,
    isActive: call.isActive,
  };
}
