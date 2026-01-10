import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAudioStore, useTalkgroupsStore } from '../../store';
import { useCallsStore } from '../../store/calls';
import { useWebSocket } from '../../hooks/useWebSocket';

interface Position {
  x: number;
  y: number;
}

interface ActiveCall {
  talkgroupId: number;
  alphaTag?: string;
  frequency?: number;
  startTime: number;
}

// Format relative time (e.g., "5s", "2m", "1h")
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp * 1000) / 1000);

  if (seconds < 0) return 'now';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// PCM Player with built-in analyzer for visualization
class LivePCMPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sampleRate: number;
  private nextTime = 0;
  private isInitialized = false;

  constructor(sampleRate = 8000) {
    this.sampleRate = sampleRate;
  }

  init() {
    if (this.isInitialized) return;

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.gainNode = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;

    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    this.nextTime = this.audioContext.currentTime;
    this.isInitialized = true;
  }

  setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  feed(int16Data: Int16Array) {
    if (!this.isInitialized) {
      this.init();
    }

    if (!this.audioContext || !this.gainNode) return;

    // Convert Int16 to Float32
    const floatData = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      floatData[i] = int16Data[i] / 32768;
    }

    // Create audio buffer
    const buffer = this.audioContext.createBuffer(1, floatData.length, this.sampleRate);
    buffer.getChannelData(0).set(floatData);

    // Create buffer source
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // Schedule playback
    const currentTime = this.audioContext.currentTime;
    if (this.nextTime < currentTime) {
      this.nextTime = currentTime;
    }

    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  resume() {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.gainNode = null;
      this.analyser = null;
      this.isInitialized = false;
    }
  }
}

export function FloatingAudioPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<LivePCMPlayer | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastAudioTimeRef = useRef<number>(0);

  const [position, setPosition] = useState<Position>(() => {
    const saved = localStorage.getItem('floating-player-position');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return { x: window.innerWidth - 360, y: window.innerHeight - 240 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [showTalkgroups, setShowTalkgroups] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);

  const {
    isLiveEnabled,
    volume,
    setVolume,
    setLiveEnabled,
    setLiveStream,
  } = useAudioStore();

  // Use the talkgroups store's filter for controlling which talkgroups to stream
  const {
    talkgroups,
    filterMode,
    selectAll,
    clearSelection,
    toggleTalkgroup,
    isVisible,
  } = useTalkgroupsStore();
  const { calls } = useCallsStore();
  const { enableAudio } = useWebSocket();

  // Send enableAudio when this component mounts (since it only shows when isLiveEnabled=true)
  useEffect(() => {
    console.log('[FloatingAudioPlayer] Mounted - sending enableAudio(true)');
    enableAudio(true);

    return () => {
      console.log('[FloatingAudioPlayer] Unmounting - sending enableAudio(false)');
      enableAudio(false);
    };
  }, [enableAudio]);

  // Get last transmission time for each talkgroup
  const talkgroupData = useMemo(() => {
    const dataMap = new Map<number, { lastTime: number }>();
    calls.forEach((call) => {
      const existing = dataMap.get(call.talkgroup_id);
      const callTime = call.start_time;
      if (!existing || callTime > existing.lastTime) {
        dataMap.set(call.talkgroup_id, { lastTime: callTime });
      }
    });
    return dataMap;
  }, [calls]);

  // Get all talkgroups sorted by recent activity
  const sortedTalkgroups = useMemo(() => {
    // Sort: recent activity first, then alphabetically by group_name/alpha_tag
    return [...talkgroups].sort((a, b) => {
      const aRecent = talkgroupData.get(a.id)?.lastTime || 0;
      const bRecent = talkgroupData.get(b.id)?.lastTime || 0;
      if (aRecent !== bRecent) return bRecent - aRecent; // More recent first
      const aName = a.group_name || a.alpha_tag || '';
      const bName = b.group_name || b.alpha_tag || '';
      return aName.localeCompare(bName);
    });
  }, [talkgroups, talkgroupData]);

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem('floating-player-position', JSON.stringify(position));
  }, [position]);

  // Handle incoming live audio chunks
  const handleAudioChunk = useCallback(
    (event: CustomEvent) => {
      const { talkgroupId, pcmData, metadata } = event.detail;

      // Check if we're subscribed to this talkgroup based on the talkgroups filter
      const isSubscribed = isVisible(talkgroupId);

      if (isLiveEnabled && isSubscribed && playerRef.current) {
        playerRef.current.feed(pcmData);
        lastAudioTimeRef.current = Date.now();
        setIsReceivingAudio(true);

        const alphaTag = metadata?.talkgrouptag || metadata?.alphaTag;
        const frequency = metadata?.freq || metadata?.frequency;

        // Update active call info
        setActiveCall({
          talkgroupId,
          alphaTag,
          frequency,
          startTime: Date.now(),
        });

        // Update global live stream state for other components
        setLiveStream({
          talkgroupId,
          alphaTag,
          frequency,
          lastUpdate: Date.now(),
        });
      }
    },
    [isLiveEnabled, isVisible, setLiveStream]
  );

  // Initialize player and listen for audio events
  useEffect(() => {
    if (isLiveEnabled) {
      playerRef.current = new LivePCMPlayer(8000);
      playerRef.current.init();
      playerRef.current.setVolume(volume);

      window.addEventListener('audioChunk', handleAudioChunk as EventListener);

      // Check for audio timeout (no audio for 2 seconds = idle)
      const idleCheck = setInterval(() => {
        if (Date.now() - lastAudioTimeRef.current > 2000) {
          setIsReceivingAudio(false);
          setActiveCall(null);
          setLiveStream(null);
        }
      }, 500);

      return () => {
        window.removeEventListener('audioChunk', handleAudioChunk as EventListener);
        clearInterval(idleCheck);
        playerRef.current?.destroy();
        playerRef.current = null;
      };
    }
  }, [isLiveEnabled, handleAudioChunk, volume, setLiveStream]);

  // Update volume
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);

  // Draw visualization
  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = playerRef.current?.getAnalyser();

    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Clear with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1e293b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (analyser && isReceivingAudio) {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Draw frequency bars that fill the entire width
      const barsToShow = 64;
      const barGap = 2;
      const barWidth = (width - (barsToShow - 1) * barGap) / barsToShow;

      for (let i = 0; i < barsToShow; i++) {
        const dataIndex = Math.floor((i / barsToShow) * (bufferLength * 0.8));
        const value = dataArray[dataIndex];
        const barHeight = Math.max(3, (value / 255) * height * 0.95);

        // Color based on intensity
        const hue = 180 + (i / barsToShow) * 40;
        const saturation = 60 + (value / 255) * 40;
        const lightness = 40 + (value / 255) * 25;

        const x = i * (barWidth + barGap);
        const barY = height - barHeight;

        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.beginPath();
        ctx.roundRect(x, barY, barWidth, barHeight, [2, 2, 0, 0]);
        ctx.fill();

        // Glow for active bars
        if (value > 100) {
          ctx.shadowColor = `hsl(${hue}, ${saturation}%, 60%)`;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.roundRect(x, barY, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    } else {
      // Draw idle state - subtle animated bars
      const barsToShow = 64;
      const barGap = 2;
      const barWidth = (width - (barsToShow - 1) * barGap) / barsToShow;
      const time = Date.now() / 1000;

      for (let i = 0; i < barsToShow; i++) {
        const wave = Math.sin(i * 0.2 + time * 2) * 0.5 + 0.5;
        const barHeight = 4 + wave * 8;

        const x = i * (barWidth + barGap);
        const barY = height - barHeight;

        ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
        ctx.beginPath();
        ctx.roundRect(x, barY, barWidth, barHeight, [1, 1, 0, 0]);
        ctx.fill();
      }
    }

    animationRef.current = requestAnimationFrame(drawVisualization);
  }, [isReceivingAudio]);

  // Start animation loop
  useEffect(() => {
    if (isLiveEnabled && !isMinimized) {
      animationRef.current = requestAnimationFrame(drawVisualization);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLiveEnabled, isMinimized, drawVisualization]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 320 * dpr;
    canvas.height = 80 * dpr;
    const ctx = canvas.getContext('2d');
    ctx?.scale(dpr, dpr);
  }, []);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, .talkgroup-list')) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Resume audio context on user interaction
  const handleUserInteraction = () => {
    playerRef.current?.resume();
  };

  if (!isLiveEnabled) return null;

  // Use filterMode from talkgroups store
  const isStreamingAll = filterMode === 'all';
  const isMuted = filterMode === 'none';
  const visibleCount = isStreamingAll ? talkgroups.length : isMuted ? 0 : talkgroups.filter(tg => isVisible(tg.id)).length;

  return (
    <div
      className={`fixed z-50 bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 transition-all duration-200 select-none ${
        isDragging ? 'cursor-grabbing shadow-blue-500/20' : 'cursor-grab'
      }`}
      style={{ left: position.x, top: position.y, width: isMinimized ? 'auto' : 340 }}
      onMouseDown={handleMouseDown}
      onClick={handleUserInteraction}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isReceivingAudio ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-sm font-medium text-slate-200">Live Scanner</span>
          {isReceivingAudio && (
            <span className="px-1.5 py-0.5 text-xs bg-green-600/30 text-green-300 rounded border border-green-500/30">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setLiveEnabled(false)}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded transition-colors"
            title="Stop Live Audio"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Waveform Visualization */}
          <div className="px-3 pt-3">
            <canvas
              ref={canvasRef}
              className="w-full rounded-lg"
              style={{ height: 80 }}
            />
          </div>

          {/* Active Call Info */}
          <div className="px-3 py-3">
            {activeCall ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-white">
                    {activeCall.alphaTag || `TG ${activeCall.talkgroupId}`}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-green-400">Receiving</span>
                  </div>
                </div>
                {activeCall.frequency && (
                  <div className="text-xs text-slate-400 font-mono">
                    {(activeCall.frequency / 1000000).toFixed(5)} MHz
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1 h-5 bg-slate-600 rounded-full animate-pulse"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-400">Listening for transmissions...</span>
              </div>
            )}
          </div>

          {/* Volume Control */}
          <div className="px-3 pb-3 flex items-center gap-3 border-t border-slate-700/50 pt-3">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-xs text-slate-500 w-10 text-right font-mono">{Math.round(volume * 100)}%</span>
          </div>

          {/* Talkgroup Selection Controls */}
          <div className="px-3 pb-3 border-t border-slate-700/50 pt-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setShowTalkgroups(!showTalkgroups)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showTalkgroups ? 'rotate-90' : ''}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {isStreamingAll ? (
                  `Listening to ${talkgroups.length} talkgroups`
                ) : isMuted ? (
                  'Muted (0 talkgroups)'
                ) : (
                  `Listening to ${visibleCount} talkgroup${visibleCount !== 1 ? 's' : ''}`
                )}
              </button>
              <div className="flex gap-1">
                <button
                  onClick={selectAll}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    isStreamingAll
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  title="Listen to all talkgroups"
                >
                  All
                </button>
                <button
                  onClick={clearSelection}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    isMuted
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  title="Mute all talkgroups"
                >
                  None
                </button>
              </div>
            </div>

            {/* Expandable Talkgroup List */}
            {showTalkgroups && (
              <div className="talkgroup-list max-h-48 overflow-y-auto rounded-lg bg-slate-800/50 border border-slate-700/50">
                {sortedTalkgroups.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 text-center">
                    No talkgroups available.
                  </div>
                ) : (
                  sortedTalkgroups.map((tg) => {
                    const isStreaming = isVisible(tg.id);
                    const lastTime = talkgroupData.get(tg.id)?.lastTime;
                    // Build the display name - prefer group_name + description
                    const displayName = tg.group_name
                      ? `${tg.group_name}${tg.description ? ` - ${tg.description}` : ''}`
                      : tg.description || tg.alpha_tag || `TG ${tg.id}`;
                    return (
                      <button
                        key={tg.id}
                        onClick={() => toggleTalkgroup(tg.id)}
                        className={`w-full px-2 py-1.5 text-left transition-colors border-b border-slate-700/30 last:border-b-0 ${
                          isStreaming
                            ? 'bg-green-900/20 hover:bg-green-900/30'
                            : 'hover:bg-slate-700/50'
                        }`}
                        title={displayName}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`w-4 h-4 flex items-center justify-center text-xs flex-shrink-0 mt-0.5 ${
                            isStreaming ? 'text-green-400' : 'text-slate-500'
                          }`}>
                            {isStreaming ? '🔊' : '🔇'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm truncate ${isStreaming ? 'text-white' : 'text-slate-400'}`}>
                              {displayName}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                              <span>TG {tg.id}</span>
                              {lastTime && (
                                <span className="text-slate-400">{formatRelativeTime(lastTime)} ago</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Minimized state */}
      {isMinimized && (
        <div className="px-3 py-2 flex items-center gap-2">
          {isReceivingAudio ? (
            <>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-green-500 rounded-full animate-pulse"
                    style={{
                      height: `${10 + Math.random() * 10}px`,
                      animationDelay: `${i * 0.08}s`,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-white truncate max-w-36">
                {activeCall?.alphaTag || `TG ${activeCall?.talkgroupId}`}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-400">Listening...</span>
          )}
        </div>
      )}
    </div>
  );
}
