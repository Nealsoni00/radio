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
            All
          </button>
          <button
            onClick={clearSelection}
            className="flex-1 text-xs px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
          >
            None
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
          const isActive = activeTalkgroupIds.has(tg.id);

          return (
            <div
              key={tg.id}
              onClick={() => toggleTalkgroup(tg.id)}
              className={`p-2 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800 ${
                isActive ? 'bg-green-900/20 border-l-2 border-l-green-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="rounded border-slate-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <span className="font-mono text-xs text-slate-500 w-12">{tg.id}</span>
                <span className="text-sm text-white truncate flex-1">{tg.alpha_tag}</span>
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
