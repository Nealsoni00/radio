import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface WaveformPlayerProps {
  /** URL of the audio file to play */
  src: string;
  /** Optional title to display */
  title?: string;
  /** Height of the waveform in pixels */
  height?: number;
  /** Color of the waveform (unplayed portion) */
  waveColor?: string;
  /** Color of the waveform (played portion) */
  progressColor?: string;
  /** Color of the playhead cursor */
  cursorColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Callback when playback starts */
  onPlay?: () => void;
  /** Callback when playback pauses */
  onPause?: () => void;
  /** Callback when playback ends */
  onEnded?: () => void;
  /** Callback with current time updates */
  onTimeUpdate?: (currentTime: number) => void;
  /** Auto-play on load */
  autoPlay?: boolean;
  /** Initial volume (0-1) */
  initialVolume?: number;
  /** Show volume control */
  showVolumeControl?: boolean;
  /** Show time display */
  showTimeDisplay?: boolean;
  /** Compact mode (smaller controls) */
  compact?: boolean;
}

interface WaveformData {
  peaks: number[];
  duration: number;
}

/**
 * WaveformPlayer - A reusable audio player component with waveform visualization
 *
 * Features:
 * - Visual waveform display
 * - Click/drag to scrub through audio
 * - Play/pause controls
 * - Volume control
 * - Time display
 * - Keyboard shortcuts (space to play/pause, arrow keys to seek)
 *
 * @example
 * ```tsx
 * <WaveformPlayer
 *   src="/api/audio/call-123"
 *   title="Phoenix PD Dispatch"
 *   height={80}
 *   waveColor="#4b5563"
 *   progressColor="#3b82f6"
 * />
 * ```
 */
export function WaveformPlayer({
  src,
  title,
  height = 80,
  waveColor = '#4b5563',
  progressColor = '#3b82f6',
  cursorColor = '#ef4444',
  backgroundColor = '#1e293b',
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  autoPlay = false,
  initialVolume = 0.8,
  showVolumeControl = true,
  showTimeDisplay = true,
  compact = false,
}: WaveformPlayerProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // State
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(0);

  // Memoized values
  const progress = useMemo(() => {
    return duration > 0 ? currentTime / duration : 0;
  }, [currentTime, duration]);

  // Format time as MM:SS or HH:MM:SS
  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Extract peaks from audio buffer
  const extractPeaks = useCallback((audioBuffer: AudioBuffer, numPeaks: number): number[] => {
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.floor(channelData.length / numPeaks);
    const peaks: number[] = [];

    for (let i = 0; i < numPeaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);

      let max = 0;
      for (let j = start; j < end; j++) {
        const absValue = Math.abs(channelData[j]);
        if (absValue > max) max = absValue;
      }
      peaks.push(max);
    }

    // Normalize peaks
    const maxPeak = Math.max(...peaks, 0.01);
    return peaks.map(p => p / maxPeak);
  }, []);

  // Load and decode audio
  useEffect(() => {
    let cancelled = false;

    const loadAudio = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Create audio element
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.volume = initialVolume;
        audioRef.current = audio;

        // Set up audio event handlers
        audio.onloadedmetadata = () => {
          if (cancelled) return;
          setDuration(audio.duration);
        };

        audio.onended = () => {
          setIsPlaying(false);
          setCurrentTime(0);
          onEnded?.();
        };

        audio.onerror = () => {
          if (cancelled) return;
          setError('Failed to load audio');
          setIsLoading(false);
        };

        // Fetch audio data for waveform analysis
        const response = await fetch(src);
        if (!response.ok) throw new Error('Failed to fetch audio');

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        // Decode audio for waveform
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) return;

        // Extract peaks for visualization
        const containerWidth = containerRef.current?.clientWidth || 800;
        const numPeaks = Math.floor(containerWidth / 2); // 2px per peak
        const peaks = extractPeaks(audioBuffer, numPeaks);

        setWaveformData({
          peaks,
          duration: audioBuffer.duration,
        });
        setDuration(audioBuffer.duration);
        setIsLoading(false);

        // Set audio source
        audio.src = src;

        if (autoPlay) {
          audio.play().then(() => {
            setIsPlaying(true);
            onPlay?.();
          }).catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [src, autoPlay, extractPeaks, onPlay, onEnded, initialVolume]);

  // Handle volume changes without reloading audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Animation loop for time updates
  useEffect(() => {
    const updateTime = () => {
      if (audioRef.current && isPlaying) {
        const time = audioRef.current.currentTime;
        setCurrentTime(time);
        onTimeUpdate?.(time);
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, onTimeUpdate]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { peaks } = waveformData;
    const width = rect.width;
    const barWidth = Math.max(2, width / peaks.length);
    const barGap = 1;
    const centerY = rect.height / 2;
    const maxBarHeight = rect.height * 0.8;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, rect.height);

    // Draw waveform bars
    peaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = Math.max(2, peak * maxBarHeight);
      const progressX = progress * width;

      // Determine if this bar is in the played portion
      const isPlayed = x < progressX;
      ctx.fillStyle = isPlayed ? progressColor : waveColor;

      // Draw mirrored bars (top and bottom from center)
      ctx.fillRect(
        x + barGap / 2,
        centerY - barHeight / 2,
        barWidth - barGap,
        barHeight
      );
    });

    // Draw playhead cursor
    if (progress > 0 && progress < 1) {
      const cursorX = progress * width;
      ctx.fillStyle = cursorColor;
      ctx.fillRect(cursorX - 1, 0, 2, rect.height);
    }

    // Draw hover position indicator
    if (isHovering && !isDragging) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(hoverPosition - 1, 0, 2, rect.height);
    }
  }, [waveformData, progress, isHovering, hoverPosition, isDragging, waveColor, progressColor, cursorColor, backgroundColor]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !waveformData) return;

      // Re-extract peaks for new width
      // This would require re-decoding the audio, so we skip it for now
      // The waveform will just stretch/compress
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [waveformData]);

  // Seek to position
  const seekTo = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !audioRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const seekProgress = x / rect.width;
    const seekTime = seekProgress * duration;

    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
    onTimeUpdate?.(seekTime);
  }, [duration, onTimeUpdate]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverPosition(x);

    if (isDragging) {
      seekTo(e.clientX);
    }
  }, [isDragging, seekTo]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setIsDragging(false);
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging) {
      seekTo(e.touches[0].clientX);
    }
  }, [isDragging, seekTo]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Play/pause toggle
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      onPause?.();
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        onPlay?.();
      }).catch(() => {});
    }
  }, [isPlaying, onPlay, onPause]);

  // Volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, currentTime - 5);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.min(duration, currentTime + 5);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => {
            const newVol = Math.min(1, v + 0.1);
            if (audioRef.current) audioRef.current.volume = newVol;
            return newVol;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => {
            const newVol = Math.max(0, v - 0.1);
            if (audioRef.current) audioRef.current.volume = newVol;
            return newVol;
          });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, currentTime, duration]);

  // Global mouse up handler for drag
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const buttonSize = compact ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div
      ref={containerRef}
      className="waveform-player select-none"
      tabIndex={0}
      role="application"
      aria-label="Audio waveform player"
    >
      {/* Title */}
      {title && (
        <div className="text-sm text-slate-400 mb-2 truncate">{title}</div>
      )}

      {/* Waveform Canvas */}
      <div
        className="relative rounded-lg overflow-hidden mb-2"
        style={{ height, backgroundColor }}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400">
              <LoadingSpinner />
              <span className="text-sm">Loading audio...</span>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-pointer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlayPause}
          disabled={isLoading || !!error}
          className={`${buttonSize} flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <PauseIcon className={iconSize} />
          ) : (
            <PlayIcon className={iconSize} />
          )}
        </button>

        {/* Time Display */}
        {showTimeDisplay && (
          <div className="flex items-center gap-1 text-sm font-mono text-slate-300 min-w-[100px]">
            <span>{formatTime(currentTime)}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{formatTime(duration)}</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Volume Control */}
        {showVolumeControl && (
          <div className="flex items-center gap-2">
            <VolumeIcon className="w-4 h-4 text-slate-400" muted={volume === 0} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
              aria-label="Volume"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Icons
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function VolumeIcon({ className, muted }: { className?: string; muted?: boolean }) {
  if (muted) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-slate-400" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default WaveformPlayer;
