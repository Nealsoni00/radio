import { useEffect, useState } from 'react';
import { useCallsStore, useSystemStore } from '../../store';
import { getCall, getAudioUrl } from '../../services/api';
import { formatTimestamp, formatDuration, formatFrequency, formatDate } from '../../utils/formatters';
import { WaveformPlayer } from '../audio/WaveformPlayer';
import type { CallSource } from '../../types';
import {
  AUDIO_MISSING_REASONS,
  AUDIO_MISSING_INFO,
  getAudioMissingReasonCode,
  formatSpectrumRangeError,
  type AudioMissingReason,
} from '../../constants/audioStatus';

export function CallDetails() {
  const { selectedCall, selectCall } = useCallsStore();
  const { activeSystem } = useSystemStore();
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

        {/* Audio unavailable explanation */}
        {(() => {
          const reasonCode = getAudioMissingReasonCode(selectedCall, activeSystem);
          if (!reasonCode) return null;

          const info = AUDIO_MISSING_INFO[reasonCode];

          // Get description - use formatted spectrum error for out-of-spectrum
          const description = reasonCode === AUDIO_MISSING_REASONS.OUT_OF_SPECTRUM && activeSystem
            ? formatSpectrumRangeError(selectedCall.frequency, activeSystem)
            : info.description;

          const iconMap: Record<string, JSX.Element> = {
            spectrum: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            ),
            encrypted: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ),
            active: (
              <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ),
            recorder: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            unknown: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          };

          const colorMap: Record<string, string> = {
            spectrum: 'bg-orange-900/30 border-orange-700/50 text-orange-300',
            encrypted: 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300',
            active: 'bg-green-900/30 border-green-700/50 text-green-300',
            recorder: 'bg-red-900/30 border-red-700/50 text-red-300',
            unknown: 'bg-slate-800 border-slate-700 text-slate-400',
          };

          return (
            <div className={`mb-4 rounded-lg border p-3 ${colorMap[info.icon]}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {iconMap[info.icon]}
                </div>
                <div>
                  <div className="font-medium text-sm">{info.title}</div>
                  <div className="text-xs opacity-80 mt-0.5">{description}</div>
                </div>
              </div>
            </div>
          );
        })()}

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
