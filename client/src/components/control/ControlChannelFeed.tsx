import { useEffect, useRef } from 'react';
import { useControlChannelStore } from '../../store';
import { getControlChannelEvents } from '../../services/api';
import type { ControlChannelEvent } from '../../types';

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

interface EventRowProps {
  event: ControlChannelEvent;
}

function EventRow({ event }: EventRowProps) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate-800/50 border-b border-slate-800 text-sm">
      <span className="text-slate-500 font-mono text-xs w-16 flex-shrink-0">
        {formatTimestamp(event.timestamp)}
      </span>
      <span
        className={`px-1.5 py-0.5 rounded text-xs font-medium w-20 text-center flex-shrink-0 ${getEventTypeBadge(
          event.type
        )}`}
      >
        {event.type.toUpperCase()}
      </span>
      <span className={`flex-1 font-mono ${getEventTypeColor(event.type)}`}>{event.message}</span>
      {event.frequency && (
        <span className="text-slate-500 font-mono text-xs">{formatFrequency(event.frequency)}</span>
      )}
    </div>
  );
}

export function ControlChannelFeed() {
  const { events, setEvents } = useControlChannelStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

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

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-2xl mb-2">No Control Channel Events</div>
          <div className="text-sm">Waiting for P25 control channel activity...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
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
      <div ref={containerRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {events.map((event, index) => (
          <EventRow key={`${event.timestamp}-${index}`} event={event} />
        ))}
      </div>
    </div>
  );
}
