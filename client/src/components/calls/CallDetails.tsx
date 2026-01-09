import { useEffect, useState } from 'react';
import { useCallsStore } from '../../store';
import { getCall, getAudioUrl } from '../../services/api';
import { formatTimestamp, formatDuration, formatFrequency, formatDate } from '../../utils/formatters';
import { WaveformPlayer } from '../audio/WaveformPlayer';
import type { CallSource } from '../../types';

export function CallDetails() {
  const { selectedCall, selectCall } = useCallsStore();
  const [sources, setSources] = useState<CallSource[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);

  useEffect(() => {
    if (selectedCall && !selectedCall.isActive) {
      setIsLoadingSources(true);
      getCall(selectedCall.id)
        .then(({ sources }) => setSources(sources))
        .catch(console.error)
        .finally(() => setIsLoadingSources(false));
    } else {
      setSources([]);
    }
  }, [selectedCall?.id]);

  if (!selectedCall) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Select a call to view details
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <h2 className="font-semibold text-white">Call Details</h2>
        <button
          onClick={() => selectCall(null)}
          className="text-slate-400 hover:text-white text-sm"
        >
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Talkgroup info */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">
            {selectedCall.alpha_tag || `TG ${selectedCall.talkgroup_id}`}
          </h3>
          {selectedCall.group_name && (
            <p className="text-sm text-slate-400">{selectedCall.group_name}</p>
          )}
        </div>

        {/* Call info grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase">Talkgroup</div>
            <div className="text-white font-mono">{selectedCall.talkgroup_id}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase">Frequency</div>
            <div className="text-white font-mono text-sm">
              {formatFrequency(selectedCall.frequency)}
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase">Time</div>
            <div className="text-white">
              {formatDate(selectedCall.start_time)} {formatTimestamp(selectedCall.start_time)}
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase">Duration</div>
            <div className="text-white">{formatDuration(selectedCall.duration)}</div>
          </div>
        </div>

        {/* Flags */}
        <div className="flex gap-2 mb-4">
          {selectedCall.emergency && (
            <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">
              EMERGENCY
            </span>
          )}
          {selectedCall.encrypted && (
            <span className="px-2 py-1 bg-yellow-600 text-black text-xs font-bold rounded">
              ENCRYPTED
            </span>
          )}
          {selectedCall.isActive && (
            <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded animate-pulse">
              ACTIVE
            </span>
          )}
        </div>

        {/* Audio player with waveform */}
        {selectedCall.audio_file && !selectedCall.isActive && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 uppercase mb-2">Recording</div>
            <WaveformPlayer
              src={getAudioUrl(selectedCall.id)}
              height={64}
              waveColor="#475569"
              progressColor="#3b82f6"
              cursorColor="#ef4444"
              backgroundColor="#0f172a"
              compact
            />
          </div>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 uppercase mb-2">Radio Units</div>
            <div className="space-y-2">
              {sources.map((source, i) => (
                <div key={i} className="bg-slate-800 rounded-lg p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-white">
                      {source.unit_tag || source.tag || `Unit ${source.source_id}`}
                    </span>
                    <span className="text-slate-400">
                      @ {source.position?.toFixed(1) || 0}s
                    </span>
                  </div>
                  {source.emergency && (
                    <span className="text-xs text-red-400">Emergency</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoadingSources && (
          <div className="text-center text-slate-500 py-4">Loading sources...</div>
        )}
      </div>
    </div>
  );
}
