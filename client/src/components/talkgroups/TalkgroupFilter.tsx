import { useEffect, useMemo } from 'react';
import { useTalkgroupsStore, useCallsStore, useAudioStore } from '../../store';

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
  } = useAudioStore();

  // Fetch SDR config on mount
  useEffect(() => {
    fetchSDRConfig();
  }, [fetchSDRConfig]);

  // Get last known frequencies for talkgroups
  const talkgroupFrequencies = useMemo(() => {
    const freqMap = new Map<number, number>();
    calls.forEach((call) => {
      if (call.frequency) {
        freqMap.set(call.talkgroup_id, call.frequency);
      }
    });
    return freqMap;
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

  // Filter talkgroups
  const filteredTalkgroups = useMemo(() => {
    return talkgroups.filter((tg) => {
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
  }, [talkgroups, groupFilter, searchQuery]);

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
          const lastFreq = talkgroupFrequencies.get(tg.id);
          const inBand = lastFreq ? isInBand(lastFreq) : null;

          return (
            <div
              key={tg.id}
              className={`p-2 border-b border-slate-700/50 ${
                isActive ? 'bg-green-900/20 border-l-2 border-l-green-500' : ''
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
                <span className="text-sm text-white truncate flex-1">{tg.alpha_tag}</span>
                {/* In-band indicator */}
                {lastFreq && (
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
                {isActive && (
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
              </div>
              {tg.group_name && (
                <div className="text-xs text-slate-500 ml-7 mt-0.5 truncate">
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
