import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRadioReferenceStore } from '../../store/radioreference';
import { SearchBar } from './SearchBar';
import { StateSelector } from './StateSelector';
import { SystemList } from './SystemList';
import { SystemDetails } from './SystemDetails';

export function SystemBrowser() {
  const { stateId, countyId, systemId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    fetchStates,
    fetchStats,
    fetchSelectedSystems,
    stats,
    selectState,
    selectCounty,
    selectSystem,
    setTypeFilter,
    selectedStateId,
    selectedCountyId,
    selectedSystemId,
    typeFilter,
  } = useRadioReferenceStore();

  // Initialize from URL on mount
  useEffect(() => {
    fetchStates();
    fetchStats();
    fetchSelectedSystems();
  }, [fetchStates, fetchStats, fetchSelectedSystems]);

  // Sync URL params to store
  useEffect(() => {
    const urlStateId = stateId ? parseInt(stateId, 10) : null;
    const urlCountyId = countyId ? parseInt(countyId, 10) : null;
    const urlSystemId = systemId ? parseInt(systemId, 10) : null;
    const urlType = searchParams.get('type') || 'P25';

    // Update type filter from URL
    if (urlType !== typeFilter) {
      setTypeFilter(urlType);
    }

    // Update selections from URL
    if (urlSystemId && urlSystemId !== selectedSystemId) {
      selectSystem(urlSystemId);
    } else if (urlStateId && urlStateId !== selectedStateId) {
      selectState(urlStateId);
      if (urlCountyId && urlCountyId !== selectedCountyId) {
        selectCounty(urlCountyId);
      }
    }
  }, [stateId, countyId, systemId, searchParams]);

  // Update URL when store changes
  useEffect(() => {
    let path = '/browse';
    const params = new URLSearchParams();

    if (selectedSystemId) {
      path = `/browse/system/${selectedSystemId}`;
    } else if (selectedStateId) {
      path = `/browse/state/${selectedStateId}`;
      if (selectedCountyId) {
        path += `/county/${selectedCountyId}`;
      }
    }

    if (typeFilter && typeFilter !== 'P25') {
      params.set('type', typeFilter);
    }

    const newUrl = params.toString() ? `${path}?${params.toString()}` : path;
    const currentPath = window.location.pathname + window.location.search;

    if (newUrl !== currentPath) {
      navigate(newUrl, { replace: true });
    }
  }, [selectedStateId, selectedCountyId, selectedSystemId, typeFilter, navigate]);

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
