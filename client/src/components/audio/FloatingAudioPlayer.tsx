import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAudioStore, useTalkgroupsStore, useCallsStore, useConnectionStore } from '../../store';
import { useWebSocket } from '../../hooks/useWebSocket';

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 300;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 900;

interface StreamState {
  player: LivePCMPlayer;
  lastUpdate: number;
  alphaTag?: string;
  frequency?: number;
  isActive: boolean;
  activeSince: number; // When this stream first became active (for stable ordering)
  src?: number; // Radio unit ID that is transmitting
  streamStartTime?: number; // When the current transmission started (for duration display)
}

const MAX_VISIBLE_STREAMS = 6;
const MAX_SELECTED_TALKGROUPS = 20;
const IDLE_TIMEOUT_MS = 2000;

// PCM Player with built-in analyzer for visualization
// Handles resampling from 8000 Hz (trunk-recorder) to browser's native sample rate
class LivePCMPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private inputSampleRate: number;
  private nextTime = 0;
  private isInitialized = false;

  constructor(inputSampleRate = 8000) {
    this.inputSampleRate = inputSampleRate;
  }

  init() {
    if (this.isInitialized) return;

    // Use browser's native sample rate (usually 44100 or 48000 Hz)
    // Don't force 8000 Hz as most browsers don't support it
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;

    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    this.nextTime = this.audioContext.currentTime;
    this.isInitialized = true;

    console.log(`[LivePCMPlayer] Initialized with input rate ${this.inputSampleRate}Hz, output rate ${this.audioContext.sampleRate}Hz`);
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
    // Skip empty audio data (e.g., from call_start events with 0 bytes)
    if (!int16Data || int16Data.length === 0) {
      return;
    }

    if (!this.isInitialized) {
      this.init();
    }

    if (!this.audioContext || !this.gainNode) return;

    // Convert Int16 to Float32
    const floatData = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      floatData[i] = int16Data[i] / 32768;
    }

    // Create buffer at input sample rate and let the browser resample
    // We create the buffer at the INPUT rate, then use playbackRate to compensate
    // Actually, better approach: create at output rate and manually resample
    const outputSampleRate = this.audioContext.sampleRate;
    const resampleRatio = outputSampleRate / this.inputSampleRate;

    // Resample the audio data
    const outputLength = Math.round(floatData.length * resampleRatio);
    const resampledData = new Float32Array(outputLength);

    // Linear interpolation resampling
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / resampleRatio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, floatData.length - 1);
      const t = srcIndex - srcIndexFloor;
      resampledData[i] = floatData[srcIndexFloor] * (1 - t) + floatData[srcIndexCeil] * t;
    }

    const buffer = this.audioContext.createBuffer(1, outputLength, outputSampleRate);
    buffer.getChannelData(0).set(resampledData);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

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

// Format relative time (e.g., "5s", "2m", "1h") - matches TalkgroupFilter
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

// Format relative time for stream cards (uses milliseconds)
function formatStreamRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// Get recency level for color coding (0 = very recent, 1 = recent, 2 = moderate, 3 = old)
function getRecencyLevel(timestamp: number): number {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp * 1000) / 1000);

  if (seconds < 30) return 0; // Very recent (< 30s)
  if (seconds < 300) return 1; // Recent (< 5m)
  if (seconds < 1800) return 2; // Moderate (< 30m)
  return 3; // Old
}

// Get color classes based on recency
function getRecencyColorClass(level: number): string {
  switch (level) {
    case 0: return 'text-green-400 font-semibold bg-green-900/30 px-1.5 rounded';
    case 1: return 'text-green-500';
    case 2: return 'text-yellow-500';
    default: return 'text-slate-500';
  }
}

// Get display name for a talkgroup - prioritize meaningful names
function getTalkgroupDisplayName(tg: { id: number; alpha_tag: string; group_name?: string | null; description?: string | null; group_tag?: string | null }): string {
  // Use group_name + description if group_name is meaningful (>2 chars)
  if (tg.group_name && tg.group_name.length > 2) {
    return tg.description ? `${tg.group_name} - ${tg.description}` : tg.group_name;
  }
  // Use group_tag if available and meaningful (often has the actual channel name like "Control A3 – South/East Dispatch")
  if (tg.group_tag && tg.group_tag.length > 2) {
    return tg.group_tag;
  }
  // Use description if available
  if (tg.description && tg.description.length > 2) {
    return tg.description;
  }
  // Use alpha_tag only if it's meaningful (more than 2 characters)
  if (tg.alpha_tag && tg.alpha_tag.length > 2) {
    return tg.alpha_tag;
  }
  // Fall back to hex ID which is more readable
  return `TG ${tg.id.toString(16).toUpperCase()}`;
}

// Get secondary info line for a talkgroup
function getTalkgroupSecondaryInfo(tg: { id: number; alpha_tag: string; group_tag?: string | null }): string {
  const hexId = tg.alpha_tag || tg.id.toString(16);
  const parts = [`TG ${tg.id} (${hexId})`];
  if (tg.group_tag) {
    parts.push(tg.group_tag);
  }
  return parts.join(' • ');
}

// Format duration in real-time (e.g., "0:05", "1:23")
function formatDuration(startTime: number | undefined): string {
  if (!startTime) return '';
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  if (seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Individual talkgroup stream visualizer
function TalkgroupStreamCard({
  talkgroupId,
  alphaTag,
  frequency,
  analyser,
  volume,
  isActive,
  lastUpdate,
  src,
  streamStartTime,
  onVolumeChange,
}: {
  talkgroupId: number;
  alphaTag?: string;
  frequency?: number;
  analyser: AnalyserNode | null;
  volume: number;
  isActive: boolean;
  lastUpdate: number;
  src?: number;
  streamStartTime?: number;
  onVolumeChange: (volume: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 200 * dpr;
    canvas.height = 50 * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const width = 200;
      const height = 50;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      if (analyser && isActive) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barsToShow = 32;
        const barGap = 1;
        const barWidth = (width - (barsToShow - 1) * barGap) / barsToShow;

        for (let i = 0; i < barsToShow; i++) {
          const dataIndex = Math.floor((i / barsToShow) * (bufferLength * 0.8));
          const value = dataArray[dataIndex];
          const barHeight = Math.max(2, (value / 255) * height * 0.9);

          const hue = 180 + (i / barsToShow) * 40;
          const saturation = 60 + (value / 255) * 40;
          const lightness = 40 + (value / 255) * 25;

          const x = i * (barWidth + barGap);
          const barY = height - barHeight;

          ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
          ctx.beginPath();
          ctx.roundRect(x, barY, barWidth, barHeight, [1, 1, 0, 0]);
          ctx.fill();
        }
      } else {
        const barsToShow = 32;
        const barGap = 1;
        const barWidth = (width - (barsToShow - 1) * barGap) / barsToShow;

        for (let i = 0; i < barsToShow; i++) {
          const x = i * (barWidth + barGap);
          ctx.fillStyle = 'rgba(71, 85, 105, 0.3)';
          ctx.beginPath();
          ctx.roundRect(x, height - 3, barWidth, 3, [1, 1, 0, 0]);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isActive]);

  return (
    <div className={`rounded-lg p-2 border transition-all duration-300 ${
      isActive
        ? 'bg-slate-800/80 border-green-500/50 shadow-lg shadow-green-500/10'
        : 'bg-slate-800/40 border-slate-700/30 opacity-70'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-500'
          }`} />
          <span className={`text-xs font-medium truncate ${isActive ? 'text-white' : 'text-slate-400'}`}>
            {alphaTag || `TG ${talkgroupId}`}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          {frequency && (
            <span className="text-xs text-slate-500 font-mono">
              {(frequency / 1000000).toFixed(3)}
            </span>
          )}
          {!isActive && (
            <span className="text-xs text-slate-500">
              {formatStreamRelativeTime(lastUpdate)}
            </span>
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full rounded"
        style={{ height: 50 }}
      />

      {/* Metadata row: Radio unit and duration */}
      {isActive && (src || streamStartTime) && (
        <div className="flex items-center justify-between mt-1.5 text-xs">
          {src ? (
            <div className="flex items-center gap-1 text-slate-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
              <span className="font-mono text-cyan-400">{src}</span>
            </div>
          ) : (
            <div />
          )}
          {streamStartTime && (
            <div className="flex items-center gap-1 text-slate-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-mono text-green-400">{formatDuration(streamStartTime)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1.5">
        <svg className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-slate-400' : 'text-slate-600'}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
    </div>
  );
}

type ListenMode = 'follow-recent' | 'selected';

export function FloatingAudioPlayer() {
  const [position, setPosition] = useState<Position>(() => {
    const saved = localStorage.getItem('floating-player-position');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return { x: window.innerWidth - 440, y: 80 };
  });
  const [size, setSize] = useState<Size>(() => {
    const saved = localStorage.getItem('floating-player-size');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [showTalkgroupList, setShowTalkgroupList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Listen mode: follow-recent (default) or selected
  const [listenMode, setListenMode] = useState<ListenMode>(() => {
    const saved = localStorage.getItem('live-scanner-listen-mode');
    return (saved as ListenMode) || 'follow-recent';
  });

  // Selected talkgroups for "selected" mode (up to 20)
  const [selectedTalkgroups, setSelectedTalkgroups] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('live-scanner-selected-tgs');
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        return new Set(arr.slice(0, MAX_SELECTED_TALKGROUPS));
      } catch {
        // ignore
      }
    }
    return new Set();
  });

  // Map of all streams by talkgroup ID
  const streamsRef = useRef<Map<number, StreamState>>(new Map());
  const [displayStreams, setDisplayStreams] = useState<[number, StreamState][]>([]);

  const {
    isLiveEnabled,
    volume,
    setVolume,
    setLiveEnabled,
    setLiveStream,
  } = useAudioStore();

  const { talkgroups, isVisible } = useTalkgroupsStore();
  const { calls } = useCallsStore();
  const { enableAudio } = useWebSocket();
  const { liveStream } = useAudioStore();
  const { isConnected } = useConnectionStore();

  // Per-talkgroup volume state
  const [tgVolumes, setTgVolumes] = useState<Map<number, number>>(new Map());

  // Force re-render every second for live time updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Get last transmission time and frequency for each talkgroup from calls
  const talkgroupData = useMemo(() => {
    const dataMap = new Map<number, { lastTime: number; frequency: number }>();
    calls.forEach((call) => {
      const existing = dataMap.get(call.talkgroup_id);
      const callTime = call.start_time;
      if (!existing || callTime > existing.lastTime) {
        dataMap.set(call.talkgroup_id, {
          lastTime: callTime,
          frequency: call.frequency,
        });
      }
    });
    return dataMap;
  }, [calls]);

  // Save listen mode to localStorage
  useEffect(() => {
    localStorage.setItem('live-scanner-listen-mode', listenMode);
  }, [listenMode]);

  // Save selected talkgroups to localStorage
  useEffect(() => {
    localStorage.setItem('live-scanner-selected-tgs', JSON.stringify(Array.from(selectedTalkgroups)));
  }, [selectedTalkgroups]);

  // Send enableAudio when connected and live is enabled
  useEffect(() => {
    if (isLiveEnabled && isConnected) {
      console.log('[FloatingAudioPlayer] Connected with live enabled - sending enableAudio(true)');
      enableAudio(true);

      return () => {
        console.log('[FloatingAudioPlayer] Unmounting or disconnected - sending enableAudio(false)');
        enableAudio(false);
      };
    }
  }, [isLiveEnabled, isConnected, enableAudio]);

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem('floating-player-position', JSON.stringify(position));
  }, [position]);

  // Save size to localStorage
  useEffect(() => {
    localStorage.setItem('floating-player-size', JSON.stringify(size));
  }, [size]);

  // Filter and sort talkgroups for the selector - sorted by most recent activity
  const filteredTalkgroups = useMemo(() => {
    let filtered = talkgroups;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = talkgroups.filter((tg) => {
        const name = getTalkgroupDisplayName(tg).toLowerCase();
        const secondaryInfo = getTalkgroupSecondaryInfo(tg).toLowerCase();
        const id = tg.id.toString();
        return name.includes(query) || secondaryInfo.includes(query) || id.includes(query) || tg.alpha_tag.toLowerCase().includes(query);
      });
    }

    // Sort by: selected first, then by most recent activity, then alphabetically
    return [...filtered].filter(Boolean).sort((a, b) => {
      // Guard against undefined entries
      if (!a || !b) return 0;

      const aSelected = selectedTalkgroups.has(a.id);
      const bSelected = selectedTalkgroups.has(b.id);

      // Selected talkgroups first
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      // Then by most recent activity
      const aTime = talkgroupData.get(a.id)?.lastTime ?? 0;
      const bTime = talkgroupData.get(b.id)?.lastTime ?? 0;
      if (aTime !== bTime) return bTime - aTime;

      // Finally alphabetically
      const aName = getTalkgroupDisplayName(a) || '';
      const bName = getTalkgroupDisplayName(b) || '';
      return aName.localeCompare(bName);
    });
  }, [talkgroups, searchQuery, selectedTalkgroups, talkgroupData]);

  // Update display streams with stable ordering
  // Active streams stay in position (sorted by when they became active)
  // Inactive streams go to the end (sorted by most recent activity)
  const updateDisplayStreams = useCallback(() => {
    const streams = streamsRef.current;
    let entries: [number, StreamState][];

    if (listenMode === 'follow-recent') {
      entries = Array.from(streams.entries());
    } else {
      // Show selected talkgroups that have streams
      entries = Array.from(streams.entries())
        .filter(([tgId]) => selectedTalkgroups.has(tgId));
    }

    // Separate active and inactive streams
    const active = entries.filter(([, s]) => s.isActive);
    const inactive = entries.filter(([, s]) => !s.isActive);

    // Sort active streams by when they became active (stable order)
    active.sort((a, b) => a[1].activeSince - b[1].activeSince);

    // Sort inactive streams by most recent activity
    inactive.sort((a, b) => b[1].lastUpdate - a[1].lastUpdate);

    // Combine: active first (in stable order), then inactive (by recency)
    const sorted = [...active, ...inactive].slice(0, MAX_VISIBLE_STREAMS);

    setDisplayStreams(sorted);
  }, [listenMode, selectedTalkgroups]);

  // Check if we should listen to a talkgroup
  const shouldListenToTalkgroup = useCallback((talkgroupId: number): boolean => {
    if (listenMode === 'follow-recent') {
      return true; // Listen to all in follow-recent mode
    }
    return selectedTalkgroups.has(talkgroupId);
  }, [listenMode, selectedTalkgroups]);

  // Handle incoming live audio chunks
  const handleAudioChunk = useCallback(
    (event: CustomEvent) => {
      const { talkgroupId, pcmData, metadata } = event.detail;

      if (!isLiveEnabled) return;

      // Check if we should listen to this talkgroup
      if (!shouldListenToTalkgroup(talkgroupId)) return;

      // Get audio sample rate from metadata (default to 8000 for P25)
      const audioSampleRate = metadata?.audio_sample_rate || 8000;

      // Log first few audio chunks for debugging
      const streams = streamsRef.current;
      const existingStream = streams.get(talkgroupId);
      if (!existingStream) {
        console.log(`[FloatingAudioPlayer] New audio stream - TG:${talkgroupId}, sampleRate:${audioSampleRate}, pcmBytes:${pcmData.length * 2}, metadata:`, metadata);
      }

      let stream = streams.get(talkgroupId);

      // Get display name from metadata (enriched by server) or talkgroups store
      const tgInfo = talkgroups.find(t => t.id === talkgroupId);
      let displayName: string;

      // Priority: 1) groupName from metadata, 2) talkgroups store, 3) alphaTag, 4) hex ID
      if (metadata?.groupName) {
        displayName = metadata.talkgroupDescription
          ? `${metadata.groupName} - ${metadata.talkgroupDescription}`
          : metadata.groupName;
      } else if (tgInfo) {
        displayName = getTalkgroupDisplayName(tgInfo);
      } else if (metadata?.alphaTag && metadata.alphaTag.length > 2) {
        displayName = metadata.alphaTag;
      } else {
        // Fall back to hex ID which is more readable than large decimals
        displayName = `TG ${talkgroupId.toString(16).toUpperCase()}`;
      }

      const now = Date.now();

      if (!stream) {
        const player = new LivePCMPlayer(audioSampleRate);
        player.init();
        const tgVolume = tgVolumes.get(talkgroupId) ?? volume;
        player.setVolume(tgVolume);

        stream = {
          player,
          lastUpdate: now,
          alphaTag: displayName,
          frequency: metadata?.freq || metadata?.frequency,
          isActive: true,
          activeSince: now, // Track when this stream first became active
          src: metadata?.src, // Radio unit ID
          streamStartTime: now, // When this transmission started
        };
        streams.set(talkgroupId, stream);

        // Clean up old inactive streams based on mode (keep active ones)
        if (listenMode === 'follow-recent' && streams.size > MAX_VISIBLE_STREAMS * 2) {
          // Only remove inactive streams that exceed our limit
          const inactive = Array.from(streams.entries())
            .filter(([, s]) => !s.isActive)
            .sort((a, b) => a[1].lastUpdate - b[1].lastUpdate); // Oldest first

          const toRemove = inactive.slice(0, streams.size - MAX_VISIBLE_STREAMS * 2);
          for (const [oldTgId, oldStream] of toRemove) {
            oldStream.player.destroy();
            streams.delete(oldTgId);
          }
        }
      }

      // If stream was inactive and is now becoming active again, update activeSince and streamStartTime
      if (!stream.isActive) {
        stream.activeSince = now;
        stream.streamStartTime = now; // New transmission starting
      }

      stream.player.feed(pcmData);
      stream.lastUpdate = now;
      stream.isActive = true;
      stream.alphaTag = displayName || stream.alphaTag;
      stream.frequency = metadata?.freq || metadata?.frequency || stream.frequency;
      // Update src if it changes during transmission (different unit keying up)
      if (metadata?.src) {
        stream.src = metadata.src;
      }

      updateDisplayStreams();

      setLiveStream({
        talkgroupId,
        alphaTag: stream.alphaTag,
        frequency: stream.frequency,
        lastUpdate: Date.now(),
      });
    },
    [isLiveEnabled, shouldListenToTalkgroup, talkgroups, volume, tgVolumes, listenMode, updateDisplayStreams, setLiveStream]
  );

  // Listen for audio events
  useEffect(() => {
    if (isLiveEnabled) {
      window.addEventListener('audioChunk', handleAudioChunk as EventListener);

      return () => {
        window.removeEventListener('audioChunk', handleAudioChunk as EventListener);
      };
    }
  }, [isLiveEnabled, handleAudioChunk]);

  // Update display when mode or selection changes
  useEffect(() => {
    updateDisplayStreams();
  }, [listenMode, selectedTalkgroups, updateDisplayStreams]);

  // Mark idle streams and update display
  useEffect(() => {
    if (!isLiveEnabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const streams = streamsRef.current;
      let changed = false;

      streams.forEach((stream) => {
        const wasActive = stream.isActive;
        stream.isActive = (now - stream.lastUpdate) < IDLE_TIMEOUT_MS;
        if (wasActive !== stream.isActive) {
          changed = true;
        }
      });

      if (changed) {
        updateDisplayStreams();

        const activeStreams = Array.from(streams.values()).filter(s => s.isActive);
        if (activeStreams.length === 0) {
          setLiveStream(null);
        }
      }
    }, 250);

    return () => {
      clearInterval(interval);
      streamsRef.current.forEach((stream) => stream.player.destroy());
      streamsRef.current.clear();
    };
  }, [isLiveEnabled, setLiveStream, updateDisplayStreams]);

  // Update volume for all streams when global volume changes
  useEffect(() => {
    streamsRef.current.forEach((stream, talkgroupId) => {
      const tgVolume = tgVolumes.get(talkgroupId) ?? volume;
      stream.player.setVolume(tgVolume);
    });
  }, [volume, tgVolumes]);

  // Handle per-talkgroup volume change
  const handleTgVolumeChange = useCallback((talkgroupId: number, newVolume: number) => {
    setTgVolumes((prev) => {
      const next = new Map(prev);
      next.set(talkgroupId, newVolume);
      return next;
    });
    const stream = streamsRef.current.get(talkgroupId);
    if (stream) {
      stream.player.setVolume(newVolume);
    }
  }, []);

  // Toggle talkgroup selection
  const toggleTalkgroupSelection = useCallback((tgId: number) => {
    setSelectedTalkgroups((prev) => {
      const next = new Set(prev);
      if (next.has(tgId)) {
        next.delete(tgId);
      } else if (next.size < MAX_SELECTED_TALKGROUPS) {
        next.add(tgId);
      }
      return next;
    });
  }, []);

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    setSelectedTalkgroups(new Set());
  }, []);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, .stream-list, .talkgroup-selector, .resize-handle')) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  // Resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.x));
        const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX - position.x));
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, e.clientY - position.y));
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, position.x, position.y, size.width]);

  const handleUserInteraction = () => {
    streamsRef.current.forEach((stream) => stream.player.resume());
  };

  if (!isLiveEnabled) return null;

  const activeCount = displayStreams.filter(([, s]) => s.isActive).length;

  return (
    <div
      className={`fixed z-50 bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 select-none ${
        isDragging ? 'cursor-grabbing shadow-blue-500/20' : isResizing ? 'cursor-se-resize' : 'cursor-grab'
      } ${isResizing ? '' : 'transition-all duration-200'}`}
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? 'auto' : size.width,
        height: isMinimized ? 'auto' : size.height,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleUserInteraction}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${activeCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-sm font-medium text-slate-200">Live Scanner</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-green-600/30 text-green-300 rounded border border-green-500/30">
              {activeCount} LIVE
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
        <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100% - 44px)' }}>
          {/* Mode Toggle */}
          <div className="px-3 py-2 border-b border-slate-700/50 flex items-center gap-2">
            <button
              onClick={() => setListenMode('follow-recent')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                listenMode === 'follow-recent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Follow Recent
            </button>
            <button
              onClick={() => setListenMode('selected')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                listenMode === 'selected'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Selected ({selectedTalkgroups.size}/{MAX_SELECTED_TALKGROUPS})
            </button>
          </div>

          {/* Streams Grid */}
          <div className="p-3 stream-list overflow-y-auto flex-1 min-h-0">
            {displayStreams.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {displayStreams.map(([talkgroupId, stream]) => {
                  // Look up talkgroup info from store for proper display name
                  const tgInfo = talkgroups.find(t => t.id === talkgroupId);
                  let displayName: string;
                  if (tgInfo) {
                    displayName = getTalkgroupDisplayName(tgInfo);
                  } else if (stream.alphaTag && stream.alphaTag.length > 2 && !stream.alphaTag.startsWith('TG ')) {
                    displayName = stream.alphaTag;
                  } else {
                    // Fall back to hex ID which is more readable
                    displayName = `TG ${talkgroupId.toString(16).toUpperCase()}`;
                  }

                  return (
                    <TalkgroupStreamCard
                      key={talkgroupId}
                      talkgroupId={talkgroupId}
                      alphaTag={displayName}
                      frequency={stream.frequency}
                      analyser={stream.player.getAnalyser()}
                      volume={tgVolumes.get(talkgroupId) ?? volume}
                      isActive={stream.isActive}
                      lastUpdate={stream.lastUpdate}
                      src={stream.src}
                      streamStartTime={stream.streamStartTime}
                      onVolumeChange={(v) => handleTgVolumeChange(talkgroupId, v)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="flex gap-1 mb-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1 h-5 bg-slate-600 rounded-full animate-pulse"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-400">
                  {listenMode === 'follow-recent' ? 'Listening for transmissions...' : 'No selected talkgroups active'}
                </span>
                {listenMode === 'selected' && selectedTalkgroups.size === 0 && (
                  <span className="text-xs text-slate-500 mt-1">Select talkgroups below to listen</span>
                )}
              </div>
            )}
          </div>

          {/* Talkgroup Selector */}
          <div className="border-t border-slate-700/50 talkgroup-selector">
            <button
              onClick={() => setShowTalkgroupList(!showTalkgroupList)}
              className="w-full px-3 py-2 flex items-center justify-between text-sm text-slate-300 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 transition-transform ${showTalkgroupList ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span>Talkgroup Selection</span>
              </div>
              <span className="text-xs text-slate-500">
                {selectedTalkgroups.size} selected
              </span>
            </button>

            {showTalkgroupList && (
              <div className="px-3 pb-3">
                {/* Search */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    placeholder="Search talkgroups..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Quick actions */}
                {selectedTalkgroups.size > 0 && (
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={clearAllSelections}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {/* Talkgroup list */}
                <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-800/50 border border-slate-700/50">
                  {filteredTalkgroups.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500 text-center">
                      {searchQuery ? 'No matching talkgroups' : 'No talkgroups available'}
                    </div>
                  ) : (
                    filteredTalkgroups.map((tg) => {
                      const isSelected = selectedTalkgroups.has(tg.id);
                      const displayName = getTalkgroupDisplayName(tg);
                      const secondaryInfo = getTalkgroupSecondaryInfo(tg);
                      const isAtLimit = !isSelected && selectedTalkgroups.size >= MAX_SELECTED_TALKGROUPS;
                      const tgData = talkgroupData.get(tg.id);
                      const lastTime = tgData?.lastTime;
                      const isLiveNow = liveStream?.talkgroupId === tg.id;
                      const recencyLevel = lastTime ? getRecencyLevel(lastTime) : 3;

                      return (
                        <button
                          key={tg.id}
                          onClick={() => !isAtLimit && toggleTalkgroupSelection(tg.id)}
                          disabled={isAtLimit}
                          className={`w-full px-3 py-2 text-left transition-colors border-b border-slate-700/30 last:border-b-0 ${
                            isLiveNow
                              ? 'bg-green-900/30 border-l-2 border-l-green-400'
                              : isSelected
                              ? 'bg-blue-900/30 hover:bg-blue-900/40'
                              : isAtLimit
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:bg-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-slate-600'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm truncate ${isLiveNow ? 'text-green-300 font-medium' : isSelected ? 'text-white' : 'text-slate-300'}`}>
                                {displayName}
                              </div>
                              <div className={`text-xs font-mono truncate ${isLiveNow ? 'text-green-400/70' : 'text-slate-500'}`}>
                                {secondaryInfo}
                              </div>
                            </div>
                            {/* Time badge and live indicator */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {lastTime && !isLiveNow && (
                                <span className={`text-xs font-mono ${getRecencyColorClass(recencyLevel)}`}>
                                  {formatRelativeTime(lastTime)}
                                </span>
                              )}
                              {isLiveNow && (
                                <div className="flex items-end gap-0.5 h-4" title="Currently streaming">
                                  {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                      key={i}
                                      className="w-0.5 bg-green-400 rounded-sm animate-pulse"
                                      style={{
                                        height: `${4 + (i % 3) * 3}px`,
                                        animationDelay: `${i * 0.1}s`,
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Master Volume Control */}
          <div className="px-3 py-3 flex items-center gap-3 border-t border-slate-700/50 flex-shrink-0">
            <span className="text-xs text-slate-400">Master</span>
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
        </div>
      )}

      {/* Minimized state */}
      {isMinimized && (
        <div className="px-3 py-2 flex items-center gap-2">
          {activeCount > 0 ? (
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
              <span className="text-xs text-white">
                {activeCount} active
              </span>
            </>
          ) : displayStreams.length > 0 ? (
            <span className="text-xs text-slate-400">{displayStreams.length} recent</span>
          ) : (
            <span className="text-xs text-slate-400">Listening...</span>
          )}
        </div>
      )}

      {/* Resize Handle */}
      {!isMinimized && (
        <div
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group"
          onMouseDown={handleResizeMouseDown}
        >
          <svg
            className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22ZM18 14H16V12H18V14ZM14 18H12V16H14V18ZM14 14H12V12H14V14Z" />
          </svg>
        </div>
      )}
    </div>
  );
}
