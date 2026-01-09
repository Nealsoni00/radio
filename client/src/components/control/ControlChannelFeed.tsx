import { useEffect, useRef, useState } from 'react';
import { useControlChannelStore, useCallsStore } from '../../store';
import { getControlChannelEvents } from '../../services/api';
import { WaveformPlayer } from '../audio/WaveformPlayer';
import type { ControlChannelEvent, Call } from '../../types';

function getEventTypeColor(type: ControlChannelEvent['type']): string {
  switch (type) {
    case 'grant':
      return 'text-green-400';
    case 'update':
      return 'text-blue-400';
    case 'end':
      return 'text-slate-400';
    case 'encrypted':
      return 'text-red-400';
    case 'out_of_band':
      return 'text-yellow-400';
    case 'no_recorder':
      return 'text-orange-400';
    case 'decode_rate':
      return 'text-cyan-400';
    case 'system_info':
      return 'text-purple-400';
    case 'unit':
      return 'text-indigo-400';
    default:
      return 'text-slate-300';
  }
}

function getEventTypeBadge(type: ControlChannelEvent['type']): string {
  switch (type) {
    case 'grant':
      return 'bg-green-900/50 text-green-300';
    case 'update':
      return 'bg-blue-900/50 text-blue-300';
    case 'end':
      return 'bg-slate-700 text-slate-300';
    case 'encrypted':
      return 'bg-red-900/50 text-red-300';
    case 'out_of_band':
      return 'bg-yellow-900/50 text-yellow-300';
    case 'no_recorder':
      return 'bg-orange-900/50 text-orange-300';
    case 'decode_rate':
      return 'bg-cyan-900/50 text-cyan-300';
    case 'system_info':
      return 'bg-purple-900/50 text-purple-300';
    case 'unit':
      return 'bg-indigo-900/50 text-indigo-300';
    default:
      return 'bg-slate-700 text-slate-300';
  }
}

function getEventTypeLabel(type: ControlChannelEvent['type']): string {
  switch (type) {
    case 'grant':
      return 'GRANT';
    case 'update':
      return 'UPDATE';
    case 'end':
      return 'END';
    case 'encrypted':
      return 'ENCRYPT';
    case 'out_of_band':
      return 'OOB';
    case 'no_recorder':
      return 'NO REC';
    case 'decode_rate':
      return 'RATE';
    case 'system_info':
      return 'SYSTEM';
    case 'unit':
      return 'UNIT';
    default:
      return (type as string).toUpperCase().slice(0, 6);
  }
}

function formatFrequency(freq?: number): string {
  if (!freq) return '';
  return `${(freq / 1000000).toFixed(4)} MHz`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null) return '';
  const secs = Math.round(seconds);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

interface EventRowProps {
  event: ControlChannelEvent;
  recording?: Call | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onPlaybackEnded?: () => void;
}

function EventRow({ event, recording, isExpanded, onToggleExpand, onPlaybackEnded }: EventRowProps) {
  const hasRecording = !!recording?.audio_file;
  const isClickable = hasRecording && (event.type === 'grant' || event.type === 'end' || event.type === 'update');

  const handleClick = () => {
    if (isClickable && onToggleExpand) {
      onToggleExpand();
    }
  };

  return (
    <div className="border-b border-slate-800">
      <div
        className={`flex items-start gap-2 px-3 py-1 hover:bg-slate-800/50 text-xs ${
          isClickable ? 'cursor-pointer' : ''
        } ${isExpanded ? 'bg-slate-800/70' : ''}`}
        onClick={handleClick}
      >
        <span className="text-slate-500 font-mono w-14 flex-shrink-0">
          {formatTimestamp(event.timestamp)}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-medium w-14 text-center flex-shrink-0 ${getEventTypeBadge(
            event.type
          )}`}
          title={event.type.replace('_', ' ')}
        >
          {getEventTypeLabel(event.type)}
        </span>
        <span className={`flex-1 font-mono truncate ${getEventTypeColor(event.type)}`}>{event.message}</span>
        {recording?.duration != null && (
          <span className="text-slate-400 font-mono text-xs flex-shrink-0 bg-slate-700/50 px-1 rounded">
            {formatDuration(recording.duration)}
          </span>
        )}
        {event.frequency && (
          <span className="text-slate-500 font-mono text-xs flex-shrink-0">{formatFrequency(event.frequency)}</span>
        )}
        {isClickable && (
          <span className={`text-xs flex-shrink-0 transition-transform ${isExpanded ? 'text-blue-300' : 'text-blue-400'}`} title="Click to play recording">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </div>

      {/* Expanded waveform player */}
      {isExpanded && recording?.audio_file && (
        <div className="px-3 py-2 bg-slate-800/50">
          <WaveformPlayer
            src={`/api/audio/${recording.id}`}
            title={recording.alpha_tag || `TG ${recording.talkgroup_id}`}
            height={50}
            compact
            autoPlay
            showVolumeControl={false}
            onEnded={onPlaybackEnded}
            waveColor="#475569"
            progressColor="#3b82f6"
            backgroundColor="#1e293b"
          />
        </div>
      )}
    </div>
  );
}

interface ControlChannelFeedProps {
  compact?: boolean;
}

export function ControlChannelFeed({ compact = false }: ControlChannelFeedProps) {
  const { events, setEvents } = useControlChannelStore();
  const { calls } = useCallsStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null);

  // Fetch initial events
  useEffect(() => {
    getControlChannelEvents(100)
      .then(({ events }) => {
        // Events from API are oldest first, we want newest first
        setEvents(events.reverse());
      })
      .catch(console.error);
  }, [setEvents]);

  // Auto-scroll to top when new events arrive (newest at top)
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [events]);

  const handleScroll = () => {
    if (containerRef.current) {
      // If user scrolls away from top, disable auto-scroll
      autoScrollRef.current = containerRef.current.scrollTop < 50;
    }
  };

  // Find if a talkgroup has a recent recording
  const getTalkgroupRecording = (talkgroupId: number): Call | undefined => {
    return calls.find(
      (call) => call.talkgroup_id === talkgroupId && call.audio_file && !call.isActive
    );
  };

  // Generate a unique key for an event
  const getEventKey = (event: ControlChannelEvent, index: number) => `${event.timestamp}-${index}`;

  // Handle expanding/collapsing an event
  const handleToggleExpand = (eventKey: string) => {
    setExpandedEventKey(prev => prev === eventKey ? null : eventKey);
  };

  // Handle when playback ends
  const handlePlaybackEnded = () => {
    setExpandedEventKey(null);
  };

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className={compact ? 'text-sm' : 'text-2xl mb-2'}>No Control Channel Events</div>
          {!compact && <div className="text-sm">Waiting for P25 control channel activity...</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {!compact && (
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Control Channel Feed</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>{events.length} events</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span>Live</span>
            </div>
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {events.map((event, index) => {
          const eventKey = getEventKey(event, index);
          const recording = event.talkgroup ? getTalkgroupRecording(event.talkgroup) : undefined;
          return (
            <EventRow
              key={eventKey}
              event={event}
              recording={recording}
              isExpanded={expandedEventKey === eventKey}
              onToggleExpand={() => handleToggleExpand(eventKey)}
              onPlaybackEnded={handlePlaybackEnded}
            />
          );
        })}
      </div>
    </div>
  );
}
