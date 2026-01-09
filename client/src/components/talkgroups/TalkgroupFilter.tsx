import { useEffect, useMemo, useState } from 'react';
import { useTalkgroupsStore, useCallsStore, useAudioStore } from '../../store';

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

export function TalkgroupFilter() {
  const {
    talkgroups,
    selectedTalkgroups,
    groupFilter,
    searchQuery,
    fetchTalkgroups,
    toggleTalkgroup,
    selectAll,
    clearSelection,
    setGroupFilter,
    setSearchQuery,
  } = useTalkgroupsStore();

  const { activeCalls, calls } = useCallsStore();
  const {
    streamingTalkgroups,
    toggleStreamingTalkgroup,
    streamAllTalkgroups,
    clearStreamingTalkgroups,
    isLiveEnabled,
    setLiveEnabled,
    isInBand,
    fetchSDRConfig,
    liveStream,
  } = useAudioStore();

  // Fetch SDR config on mount
  useEffect(() => {
    fetchSDRConfig();
  }, [fetchSDRConfig]);

  // Force re-render every 10 seconds to update relative times
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  // Get last transmission time and frequency for each talkgroup
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

  useEffect(() => {
    fetchTalkgroups();
  }, [fetchTalkgroups]);

  // Get unique groups
  const groups = useMemo(() => {
    const groupSet = new Set(talkgroups.map((tg) => tg.group_name).filter(Boolean) as string[]);
    return Array.from(groupSet).sort();
  }, [talkgroups]);

  // Active talkgroup IDs
  const activeTalkgroupIds = useMemo(() => {
    return new Set(activeCalls.map((c) => c.talkgroup_id));
  }, [activeCalls]);

  // Filter and sort talkgroups by last transmission time
  const filteredTalkgroups = useMemo(() => {
    const filtered = talkgroups.filter((tg) => {
      if (groupFilter && tg.group_name !== groupFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          tg.alpha_tag.toLowerCase().includes(query) ||
          tg.description?.toLowerCase().includes(query) ||
          tg.id.toString().includes(searchQuery)
        );
      }
      return true;
    });

    // Sort by last transmission time (most recent first)
    // Talkgroups with no transmissions go to the bottom
    return filtered.sort((a, b) => {
      const aTime = talkgroupData.get(a.id)?.lastTime ?? 0;
      const bTime = talkgroupData.get(b.id)?.lastTime ?? 0;
      return bTime - aTime;
    });
  }, [talkgroups, groupFilter, searchQuery, talkgroupData]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 bg-slate-800 border-b border-slate-700">
        <h2 className="font-semibold text-white">Talkgroups</h2>
      </div>

      {/* Live streaming toggle */}
      <div className="p-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isLiveEnabled}
              onChange={(e) => setLiveEnabled(e.target.checked)}
              className="rounded border-slate-500 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-medium text-white">Live Audio</span>
            {isLiveEnabled && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </label>
        </div>
        {isLiveEnabled && (
          <div className="flex gap-2 text-xs">
            <button
              onClick={streamAllTalkgroups}
              className={`flex-1 px-2 py-1 rounded ${
                streamingTalkgroups.size === 0
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Stream All
            </button>
            <button
              onClick={clearStreamingTalkgroups}
              className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Search and filter controls */}
      <div className="p-3 border-b border-slate-700 space-y-2">
        <input
          type="text"
          placeholder="Search talkgroups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={groupFilter || ''}
          onChange={(e) => setGroupFilter(e.target.value || null)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All Groups</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="flex-1 text-xs px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
          >
            Show All
          </button>
          <button
            onClick={clearSelection}
            className="flex-1 text-xs px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
          >
            Hide All
          </button>
        </div>
      </div>

      {/* Talkgroup list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTalkgroups.length === 0 && (
          <div className="p-4 text-center text-slate-500 text-sm">
            No talkgroups found
          </div>
        )}
        {filteredTalkgroups.map((tg) => {
          const isSelected = selectedTalkgroups.size === 0 || selectedTalkgroups.has(tg.id);
          const isStreaming = isLiveEnabled && (streamingTalkgroups.size === 0 || streamingTalkgroups.has(tg.id));
          const isActive = activeTalkgroupIds.has(tg.id);
          const isLiveNow = liveStream?.talkgroupId === tg.id;
          const tgData = talkgroupData.get(tg.id);
          const lastFreq = tgData?.frequency;
          const lastTime = tgData?.lastTime;
          const inBand = lastFreq ? isInBand(lastFreq) : null;

          return (
            <div
              key={tg.id}
              className={`p-2 border-b border-slate-700/50 transition-colors ${
                isLiveNow
                  ? 'bg-green-900/30 border-l-2 border-l-green-400'
                  : isActive
                  ? 'bg-green-900/20 border-l-2 border-l-green-500'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Filter checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleTalkgroup(tg.id)}
                  className="rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                  title="Show in call list"
                />
                {/* Streaming toggle (only when live is enabled) */}
                {isLiveEnabled && (
                  <button
                    onClick={() => toggleStreamingTalkgroup(tg.id)}
                    className={`w-5 h-5 flex items-center justify-center rounded text-xs ${
                      isStreaming
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                    title={isStreaming ? 'Click to mute' : 'Click to stream'}
                  >
                    {isStreaming ? '🔊' : '🔇'}
                  </button>
                )}
                <span className="font-mono text-xs text-slate-500 w-12">{tg.id}</span>
                <span className={`text-sm truncate flex-1 ${isLiveNow ? 'text-green-300 font-medium' : 'text-white'}`}>
                  {tg.alpha_tag}
                </span>
                {/* Live waveform animation when actively streaming */}
                {isLiveNow && (
                  <div className="flex items-end gap-0.5 h-4" title="Currently streaming">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-1 bg-green-400 rounded-sm"
                        style={{
                          animation: 'waveform 0.5s ease-in-out infinite alternate',
                          animationDelay: `${i * 0.1}s`,
                          height: '100%',
                        }}
                      />
                    ))}
                    <style>{`
                      @keyframes waveform {
                        0% { transform: scaleY(0.3); }
                        100% { transform: scaleY(1); }
                      }
                    `}</style>
                  </div>
                )}
                {/* Last transmission time */}
                {lastTime && !isLiveNow && (
                  <span
                    className="text-xs text-slate-500 font-mono w-8 text-right"
                    title={new Date(lastTime * 1000).toLocaleString()}
                  >
                    {formatRelativeTime(lastTime)}
                  </span>
                )}
                {/* In-band indicator */}
                {lastFreq && !isLiveNow && (
                  <span
                    className={`text-xs px-1 rounded ${
                      inBand
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-red-900/50 text-red-400'
                    }`}
                    title={`${(lastFreq / 1000000).toFixed(4)} MHz${inBand ? ' (in band)' : ' (out of band)'}`}
                  >
                    {inBand ? 'IN' : 'OUT'}
                  </span>
                )}
                {isActive && !isLiveNow && (
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
              </div>
              {tg.group_name && (
                <div className={`text-xs ml-7 mt-0.5 truncate ${isLiveNow ? 'text-green-400/70' : 'text-slate-500'}`}>
                  {tg.group_name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 text-xs text-slate-500">
        {filteredTalkgroups.length} of {talkgroups.length} talkgroups
        {selectedTalkgroups.size > 0 && ` (${selectedTalkgroups.size} filtered)`}
      </div>
    </div>
  );
}
