import { useState, useEffect, useCallback } from 'react';
import {
  getSpectrumRecordings,
  startSpectrumRecording,
  stopSpectrumRecording,
  deleteSpectrumRecording,
  startSpectrumReplay,
  stopSpectrumReplay,
  pauseSpectrumReplay,
  resumeSpectrumReplay,
  getSpectrumStatus,
  getSpectrumRecordingEvents,
  type SpectrumRecording,
  type RecordingStatus,
  type ReplayStatus,
  type RecordedControlChannelEvent,
} from '../../services/api';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFrequency(hz: number): string {
  return `${(hz / 1_000_000).toFixed(3)} MHz`;
}

export function SpectrumRecorder() {
  const [recordings, setRecordings] = useState<SpectrumRecording[]>([]);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({ isRecording: false });
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>({ isReplaying: false, isPaused: false });
  const [duration, setDuration] = useState(30);
  const [recordingName, setRecordingName] = useState('');
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<RecordedControlChannelEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getSpectrumStatus();
      setRecordingStatus(status.recording || { isRecording: false });
      setReplayStatus(status.replay || { isReplaying: false, isPaused: false });
      setRecordings(status.recordings || []);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 1000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleStartRecording = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await startSpectrumRecording(duration, recordingName || undefined);
      setRecordingName('');
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setIsLoading(true);
    try {
      await stopSpectrumRecording();
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartReplay = async (recordingId: string) => {
    setError(null);
    setIsLoading(true);
    try {
      await startSpectrumReplay(recordingId, loop);
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopReplay = async () => {
    setIsLoading(true);
    try {
      await stopSpectrumReplay();
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePauseReplay = async () => {
    try {
      await pauseSpectrumReplay();
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleResumeReplay = async () => {
    try {
      await resumeSpectrumReplay();
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteRecording = async (id: string) => {
    if (!confirm('Delete this recording?')) return;
    try {
      await deleteSpectrumRecording(id);
      if (expandedRecordingId === id) {
        setExpandedRecordingId(null);
        setExpandedEvents([]);
      }
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleExpand = async (id: string) => {
    if (expandedRecordingId === id) {
      setExpandedRecordingId(null);
      setExpandedEvents([]);
      return;
    }

    setExpandedRecordingId(id);
    setEventsLoading(true);
    try {
      const data = await getSpectrumRecordingEvents(id);
      setExpandedEvents(data.controlChannelEvents || []);
    } catch (err) {
      setError((err as Error).message);
      setExpandedEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const getEventTypeColor = (type: string): string => {
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
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">Spectrum Recording</h3>

      {error && (
        <div className="bg-red-900/50 text-red-200 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Recording Controls */}
      <div className="space-y-3">
        {!recordingStatus.isRecording ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Recording name (optional)"
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 placeholder-slate-400"
              />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-slate-400">Duration:</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
              >
                <option value={10}>10 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
                <option value={600}>10 minutes</option>
              </select>
              <button
                onClick={handleStartRecording}
                disabled={isLoading}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                Record
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-sm text-red-400">Recording...</span>
              <span className="text-xs text-slate-400">
                {recordingStatus.elapsed !== undefined && formatDuration(recordingStatus.elapsed)}
                {recordingStatus.progress !== undefined && recordingStatus.elapsed !== undefined && ' • '}
                {recordingStatus.progress !== undefined && `${Math.round(recordingStatus.progress * 100)}%`}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-red-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(recordingStatus.progress || 0) * 100}%` }}
              />
            </div>
            <button
              onClick={handleStopRecording}
              disabled={isLoading}
              className="px-4 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              Stop Recording
            </button>
          </div>
        )}
      </div>

      {/* Replay Status */}
      {replayStatus.isReplaying && (
        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${replayStatus.isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`}></span>
            <span className="text-sm text-green-400">
              {replayStatus.isPaused ? 'Paused' : 'Replaying...'}
            </span>
            <span className="text-xs text-slate-400">
              {replayStatus.progress !== undefined
                ? `${Math.round(replayStatus.progress * 100)}%`
                : ''}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(replayStatus.progress || 0) * 100}%` }}
            />
          </div>
          <div className="flex gap-2">
            {replayStatus.isPaused ? (
              <button
                onClick={handleResumeReplay}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={handlePauseReplay}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm"
              >
                Pause
              </button>
            )}
            <button
              onClick={handleStopReplay}
              className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Recordings List */}
      {recordings.length > 0 && (
        <div className="border-t border-slate-700 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-slate-400 uppercase">Saved Recordings</h4>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                className="rounded border-slate-600 bg-slate-700 text-blue-500"
              />
              Loop
            </label>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {recordings.map((rec) => {
              const hasEvents = (rec.controlChannelEvents ?? 0) > 0;
              const isExpanded = expandedRecordingId === rec.id;
              return (
                <div key={rec.id}>
                  <div
                    className={`flex items-center justify-between p-2 rounded-t text-sm ${
                      replayStatus.recordingId === rec.id
                        ? 'bg-green-900/30 border border-green-700'
                        : 'bg-slate-700/50 hover:bg-slate-700'
                    } ${isExpanded ? 'rounded-b-none' : 'rounded-b'}`}
                  >
                    <div
                      className={`flex-1 min-w-0 ${hasEvents ? 'cursor-pointer' : ''}`}
                      onClick={() => hasEvents && handleToggleExpand(rec.id)}
                    >
                      <div className="text-slate-200 truncate flex items-center gap-2">
                        {rec.name}
                        {hasEvents && (
                          <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>{formatDuration(rec.duration)}</span>
                        <span>{formatFrequency(rec.centerFreq)}</span>
                        <span>{formatFileSize(rec.fileSize)}</span>
                        {rec.transmissions !== undefined && rec.transmissions > 0 && (
                          <span className="text-green-400 cursor-help" title="Transmissions - total radio calls recorded">{rec.transmissions} TX</span>
                        )}
                        {rec.uniqueTalkgroups !== undefined && rec.uniqueTalkgroups > 0 && (
                          <span className="text-blue-400 cursor-help" title="Talkgroups - unique radio groups with activity">{rec.uniqueTalkgroups} TG</span>
                        )}
                        {rec.controlChannelEvents !== undefined && rec.controlChannelEvents > 0 && (
                          <span className="text-yellow-400 cursor-help" title="Control Channel events - system signaling messages">{rec.controlChannelEvents} CC</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {replayStatus.recordingId === rec.id ? (
                        <button
                          onClick={handleStopReplay}
                          className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs"
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartReplay(rec.id)}
                          disabled={replayStatus.isReplaying || recordingStatus.isRecording || isLoading}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs disabled:opacity-50"
                        >
                          Play
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteRecording(rec.id)}
                        disabled={replayStatus.recordingId === rec.id}
                        className="px-2 py-1 bg-red-600/50 hover:bg-red-600 text-white rounded text-xs disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {/* Expanded events list */}
                  {isExpanded && (
                    <div className="bg-slate-800 border border-t-0 border-slate-600 rounded-b p-2 max-h-48 overflow-y-auto">
                      {eventsLoading ? (
                        <div className="text-xs text-slate-400 text-center py-2">Loading events...</div>
                      ) : !expandedEvents || expandedEvents.length === 0 ? (
                        <div className="text-xs text-slate-500 text-center py-2">No events recorded</div>
                      ) : (
                        <div className="space-y-0.5">
                          {expandedEvents.map((event, idx) => (
                            <div key={idx} className="text-xs flex gap-2 py-0.5 border-b border-slate-700/50 last:border-0">
                              <span className="text-slate-500 font-mono w-12 flex-shrink-0">
                                {(event.relativeTime / 1000).toFixed(1)}s
                              </span>
                              <span className={`font-medium w-12 flex-shrink-0 uppercase ${getEventTypeColor(event.type)}`}>
                                {event.type.slice(0, 6)}
                              </span>
                              {event.talkgroup && (
                                <span className="text-cyan-400 w-16 flex-shrink-0">
                                  TG {event.talkgroup}
                                </span>
                              )}
                              <span className="text-slate-300 truncate flex-1" title={event.message}>
                                {event.talkgroupTag || event.message}
                              </span>
                              {event.frequency && (
                                <span className="text-slate-500 font-mono flex-shrink-0">
                                  {formatFrequency(event.frequency)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recordings.length === 0 && !recordingStatus.isRecording && (
        <p className="text-xs text-slate-500 text-center py-2">
          No recordings yet. Start recording to capture spectrum data for replay.
        </p>
      )}
    </div>
  );
}
