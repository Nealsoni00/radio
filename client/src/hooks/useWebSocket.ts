import { useEffect, useRef, useCallback } from 'react';
import { useCallsStore, useConnectionStore, useAudioStore, useControlChannelStore } from '../store';
import { useFFTStore } from '../store/fft';
import type { ServerMessage, ClientMessage, Call } from '../types';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const { addCall, updateCall, setActiveCalls } = useCallsStore();
  const { setConnected, setDecodeRate } = useConnectionStore();
  const { setPlaying, setCurrentTalkgroup, addToQueue, streamingTalkgroups, isLiveEnabled } = useAudioStore();
  const { addEvent: addControlChannelEvent } = useControlChannelStore();
  const { updateFFT: updateFFTData } = useFFTStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      // Subscribe to all talkgroups by default
      ws.send(JSON.stringify({ type: 'subscribeAll' } as ClientMessage));
    };

    ws.onmessage = (event) => {
      // Handle binary data (audio or FFT)
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => {
          handleBinaryData(buffer);
        });
        return;
      }

      // Handle JSON messages
      try {
        const message: ServerMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    wsRef.current = ws;
  }, [setConnected]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = window.setTimeout(() => {
      console.log('Attempting to reconnect...');
      connect();
    }, 3000);
  }, [connect]);

  const handleMessage = useCallback(
    (message: ServerMessage) => {
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
            const call = transformCall(message.call);
            updateCall(call.id, call);
            setPlaying(false);
          }
          break;

        case 'callsActive':
          if (message.calls) {
            setActiveCalls(message.calls.map(transformCall));
          }
          break;

        case 'newRecording':
          if (message.call && isLiveEnabled) {
            const tgId = message.call.talkgroupId || (message.call as any).talkgroup_id;
            // Check if this talkgroup is in our streaming selection
            // Empty set = all talkgroups
            const shouldQueue = streamingTalkgroups.size === 0 || streamingTalkgroups.has(tgId);
            if (shouldQueue && message.call.audioUrl) {
              addToQueue({
                id: message.call.id || '',
                talkgroupId: tgId,
                alphaTag: message.call.alphaTag || (message.call as any).alpha_tag,
                audioUrl: message.call.audioUrl,
                duration: message.call.duration ?? undefined,
              });
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

        case 'error':
          console.error('Server error:', message.error);
          break;
      }
    },
    [addCall, updateCall, setActiveCalls, setDecodeRate, setCurrentTalkgroup, setPlaying, addToQueue, streamingTalkgroups, isLiveEnabled, addControlChannelEvent]
  );

  const handleBinaryData = useCallback((buffer: ArrayBuffer) => {
    // Parse header length (first 4 bytes, little-endian)
    const view = new DataView(buffer);
    const headerLen = view.getUint32(0, true);

    // Parse JSON header
    const headerBytes = new Uint8Array(buffer, 4, headerLen);
    const headerStr = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerStr);

    if (header.type === 'fft') {
      // Handle FFT data
      const magnitudes = new Float32Array(buffer, 4 + headerLen);
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
      // Handle audio data
      const pcmData = new Int16Array(buffer, 4 + headerLen);

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
  }, [updateFFTData]);

  const subscribe = useCallback((talkgroups: number[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'subscribe',
          talkgroups,
        } as ClientMessage)
      );
    }
  }, []);

  const unsubscribe = useCallback((talkgroups: number[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'unsubscribe',
          talkgroups,
        } as ClientMessage)
      );
    }
  }, []);

  const subscribeAll = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribeAll' } as ClientMessage));
    }
  }, []);

  const enableAudio = useCallback((enabled: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'enableAudio',
          enabled,
        } as ClientMessage)
      );
    }
  }, []);

  const enableFFT = useCallback((enabled: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'enableFFT',
          enabled,
        } as ClientMessage)
      );
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

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
