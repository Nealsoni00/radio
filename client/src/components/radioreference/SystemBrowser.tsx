import { useEffect } from 'react';
import { useRadioReferenceStore } from '../../store/radioreference';
import { SearchBar } from './SearchBar';
import { StateSelector } from './StateSelector';
import { SystemList } from './SystemList';
import { SystemDetails } from './SystemDetails';

export function SystemBrowser() {
  const { fetchStates, fetchStats, fetchSelectedSystems, stats } = useRadioReferenceStore();

  useEffect(() => {
    fetchStates();
    fetchStats();
    fetchSelectedSystems();
  }, [fetchStates, fetchStats, fetchSelectedSystems]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Stats bar */}
      {stats && (
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 text-sm text-slate-400">
          <span className="mr-4">
            <span className="text-slate-300 font-medium">{stats.p25Systems.toLocaleString()}</span> P25 Systems
          </span>
          <span className="mr-4">
            <span className="text-slate-300 font-medium">{stats.totalTalkgroups.toLocaleString()}</span> Talkgroups
          </span>
          <span>
            <span className="text-slate-300 font-medium">{stats.totalSites.toLocaleString()}</span> Sites
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Filters */}
        <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
          <div className="p-3">
            <SearchBar />
          </div>
          <div className="flex-1 overflow-y-auto">
            <StateSelector />
          </div>
        </aside>

        {/* Center - System list */}
        <main className="flex-1 overflow-y-auto bg-slate-900">
          <SystemList />
        </main>

        {/* Right sidebar - System details */}
        <aside className="w-96 bg-slate-800 border-l border-slate-700 overflow-y-auto">
          <SystemDetails />
        </aside>
      </div>
    </div>
  );
}
