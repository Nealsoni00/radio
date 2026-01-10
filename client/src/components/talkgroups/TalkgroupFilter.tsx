import { useEffect, useMemo, useState } from 'react';
import { useTalkgroupsStore, useCallsStore, useAudioStore } from '../../store';
import { useSystemStore } from '../../store/system';
import { useWebSocket } from '../../hooks/useWebSocket';

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

export function TalkgroupFilter() {
  const {
    talkgroups,
    filterMode,
    groupFilter,
    searchQuery,
    isLoading,
    fetchTalkgroupsForSystem,
    clearTalkgroups,
    toggleTalkgroup,
    selectAll,
    clearSelection,
    setGroupFilter,
    setSearchQuery,
    isVisible,
  } = useTalkgroupsStore();

  const { activeCalls, calls, clearCalls, fetchCalls } = useCallsStore();
  const { activeSystem, fetchActiveSystem, restorePersistedSystem } = useSystemStore();
  const {
    isLiveEnabled,
    setLiveEnabled,
    isInBand,
    fetchSDRConfig,
    liveStream,
  } = useAudioStore();

  const { enableAudio } = useWebSocket();

  // Fetch SDR config and active system on mount, restore persisted system if none active
  useEffect(() => {
    fetchSDRConfig();
    fetchActiveSystem().then(() => {
      // After fetching, if no active system, try to restore from localStorage
      restorePersistedSystem();
    });
  }, [fetchSDRConfig, fetchActiveSystem, restorePersistedSystem]);

  // Fetch talkgroups and calls when active system changes
  useEffect(() => {
    if (activeSystem) {
      fetchTalkgroupsForSystem(activeSystem.id);
      // Clear old calls and fetch new ones for this system
      clearCalls();
      fetchCalls({ limit: 100 });
      // Auto-enable live audio when system is active
      if (isLiveEnabled) {
        enableAudio(true);
      }
    } else {
      clearTalkgroups();
      clearCalls();
    }
  }, [activeSystem?.id, fetchTalkgroupsForSystem, clearTalkgroups, clearCalls, fetchCalls, isLiveEnabled, enableAudio]);

  // Force re-render every second for live time updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
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
          tg.group_tag?.toLowerCase().includes(query) ||
          tg.group_name?.toLowerCase().includes(query) ||
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

      {/* Live streaming toggle - opens floating player */}
      <div className="p-3 border-b border-slate-700 bg-slate-800/50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isLiveEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              console.log('[TalkgroupFilter] Live Audio checkbox changed to:', enabled);
              setLiveEnabled(enabled);
              enableAudio(enabled);
            }}
            className="rounded border-slate-500 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm font-medium text-white">Live Audio</span>
          {isLiveEnabled && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </label>
        {isLiveEnabled && (
          <p className="text-xs text-slate-500 mt-2">
            Use the Live Scanner panel to select talkgroups
          </p>
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
            className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${
              filterMode === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            All
          </button>
          <button
            onClick={clearSelection}
            className={`flex-1 text-xs px-2 py-1.5 rounded transition-colors ${
              filterMode === 'none'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            None
          </button>
        </div>
      </div>

      {/* Talkgroup list */}
      <div className="flex-1 overflow-y-auto">
        {/* Prompt to select a system */}
        {!activeSystem && (
          <div className="p-6 text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            <h3 className="text-white font-medium mb-2">No System Selected</h3>
            <p className="text-slate-400 text-sm mb-4">
              Go to <span className="text-blue-400">Browse Systems</span> and click <span className="text-orange-400">Switch</span> on a P25 system to start scanning.
            </p>
          </div>
        )}
        {/* Loading indicator */}
        {isLoading && (
          <div className="p-4 text-center">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Loading talkgroups...</p>
          </div>
        )}
        {/* No talkgroups found */}
        {activeSystem && !isLoading && filteredTalkgroups.length === 0 && (
          <div className="p-4 text-center text-slate-500 text-sm">
            No talkgroups found
          </div>
        )}
        {filteredTalkgroups.map((tg) => {
          const isSelected = isVisible(tg.id);
          const isActive = activeTalkgroupIds.has(tg.id);
          const isLiveNow = liveStream?.talkgroupId === tg.id;
          const tgData = talkgroupData.get(tg.id);
          const lastFreq = tgData?.frequency;
          const lastTime = tgData?.lastTime;
          const inBand = lastFreq ? isInBand(lastFreq) : null;
          const recencyLevel = lastTime ? getRecencyLevel(lastTime) : 3;
          const isVeryRecent = recencyLevel === 0;

          return (
            <div
              key={tg.id}
              className={`p-2 border-b border-slate-700/50 transition-all duration-300 cursor-pointer hover:bg-slate-800/50 ${
                isLiveNow
                  ? 'bg-green-900/30 border-l-2 border-l-green-400'
                  : isActive
                  ? 'bg-green-900/20 border-l-2 border-l-green-500'
                  : isVeryRecent
                  ? 'bg-green-900/10 border-l-2 border-l-green-600/50'
                  : ''
              }`}
              onClick={() => toggleTalkgroup(tg.id)}
            >
              <div className="flex items-center gap-2">
                {/* Filter checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleTalkgroup(tg.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer w-4 h-4"
                  title="Show in call list"
                />
                {/* Full talkgroup name - show group_name + description, or alpha_tag as fallback */}
                <span
                  className={`text-sm truncate flex-1 ${isLiveNow ? 'text-green-300 font-medium' : 'text-white'}`}
                  title={[
                    `ID: ${tg.id} (hex: ${tg.alpha_tag || tg.id.toString(16)})`,
                    tg.group_name && `Group: ${tg.group_name}`,
                    tg.description && `Description: ${tg.description}`,
                    tg.group_tag && `Tag: ${tg.group_tag}`,
                    `Mode: ${tg.mode || 'Unknown'}`,
                  ].filter(Boolean).join('\n')}
                >
                  {tg.group_name
                    ? `${tg.group_name}${tg.description ? ` - ${tg.description}` : ''}`
                    : tg.alpha_tag || `TG ${tg.id}`}
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
                {/* Last transmission time with recency color */}
                {lastTime && !isLiveNow && (
                  <span
                    className={`text-xs font-mono text-right ${getRecencyColorClass(getRecencyLevel(lastTime))}`}
                    title={`Last activity: ${new Date(lastTime * 1000).toLocaleString()}`}
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
              {/* Show talkgroup ID and hex code on secondary line */}
              <div
                className={`text-xs ml-7 mt-0.5 truncate font-mono ${isLiveNow ? 'text-green-400/70' : 'text-slate-500'}`}
              >
                TG {tg.id} ({tg.alpha_tag || tg.id.toString(16)}){tg.group_tag ? ` • ${tg.group_tag}` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 text-xs text-slate-500">
        {filteredTalkgroups.length} of {talkgroups.length} talkgroups
        {filterMode === 'none' && ' (all hidden)'}
        {filterMode === 'custom' && ` (${filteredTalkgroups.filter(tg => isVisible(tg.id)).length} visible)`}
      </div>
    </div>
  );
}
