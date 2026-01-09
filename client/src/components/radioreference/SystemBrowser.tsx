import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRadioReferenceStore } from '../../store/radioreference';
import { SearchBar } from './SearchBar';
import { StateSelector } from './StateSelector';
import { SystemList } from './SystemList';
import { SystemDetails } from './SystemDetails';
import { ControlChannelScanner } from './ControlChannelScanner';
import { MapBrowser } from '../map';
import { ResizablePanel } from '../layout/ResizablePanel';

type ViewMode = 'map' | 'list';

export function SystemBrowser() {
  const { stateId, countyId, systemId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialLoadDone = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (searchParams.get('view') as ViewMode) || 'map';
  });
  const [showScanner, setShowScanner] = useState(false);

  const {
    fetchStates,
    fetchStats,
    fetchSelectedSystems,
    fetchSystems,
    stats,
    states,
    counties,
    selectState,
    selectCounty,
    selectSystem,
    setTypeFilter,
    selectedStateId,
    selectedCountyId,
    selectedSystemId,
    typeFilter,
    systems,
  } = useRadioReferenceStore();

  const selectedState = states.find((s) => s.id === selectedStateId);
  const selectedCounty = counties.find((c) => c.id === selectedCountyId);

  // Initialize from URL on mount
  useEffect(() => {
    fetchStates();
    fetchStats();
    fetchSelectedSystems();

    // If no URL params, fetch all systems on initial load
    if (!stateId && !systemId && !initialLoadDone.current) {
      initialLoadDone.current = true;
      fetchSystems({ reset: true });
    }
  }, [fetchStates, fetchStats, fetchSelectedSystems, fetchSystems, stateId, systemId]);

  // Sync URL params to store
  useEffect(() => {
    const urlStateId = stateId ? parseInt(stateId, 10) : null;
    const urlCountyId = countyId ? parseInt(countyId, 10) : null;
    const urlSystemId = systemId ? parseInt(systemId, 10) : null;
    const urlType = searchParams.get('type') || 'P25';
    const urlView = searchParams.get('view') as ViewMode;

    // Update view mode from URL
    if (urlView && urlView !== viewMode) {
      setViewMode(urlView);
    }

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

    if (viewMode !== 'map') {
      params.set('view', viewMode);
    }

    const newUrl = params.toString() ? `${path}?${params.toString()}` : path;
    const currentPath = window.location.pathname + window.location.search;

    if (newUrl !== currentPath) {
      navigate(newUrl, { replace: true });
    }
  }, [selectedStateId, selectedCountyId, selectedSystemId, typeFilter, viewMode, navigate]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar with stats and view toggle */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
        {/* Stats */}
        {stats && (
          <div className="text-sm text-slate-400">
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

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1">
          <button
            onClick={() => handleViewModeChange('map')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'map'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Map
          </button>
          <button
            onClick={() => handleViewModeChange('list')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'list' ? (
          <>
            {/* Left sidebar - Filters (only in list view) */}
            <ResizablePanel
              direction="horizontal"
              defaultSize={256}
              minSize={200}
              maxSize={400}
              storageKey="browse-left-sidebar"
              handlePosition="end"
              className="bg-slate-800 border-r border-slate-700 flex-shrink-0"
            >
              <div className="h-full flex flex-col">
                <div className="p-3">
                  <SearchBar />
                </div>
                <div className="flex-1 overflow-y-auto">
                  <StateSelector />
                </div>
              </div>
            </ResizablePanel>

            {/* Center - System list */}
            <main className="flex-1 overflow-y-auto bg-slate-900">
              <SystemList />
            </main>
          </>
        ) : (
          /* Map view - takes full center width */
          <main className="flex-1 overflow-hidden bg-slate-900">
            <MapBrowser />
          </main>
        )}

        {/* Right sidebar - System details (always visible) */}
        <ResizablePanel
          direction="horizontal"
          defaultSize={384}
          minSize={280}
          maxSize={600}
          storageKey="browse-right-sidebar"
          handlePosition="start"
          className="bg-slate-800 border-l border-slate-700 flex-shrink-0"
        >
          <div className="h-full flex flex-col overflow-hidden">
            {/* Mini system list in map view */}
            {viewMode === 'map' && systems.length > 0 && (
              <ResizablePanel
                direction="vertical"
                defaultSize={200}
                minSize={100}
                maxSize={500}
                storageKey="browse-systems-list"
                handlePosition="end"
                className="border-b border-slate-700 flex-shrink-0"
              >
                <div className="h-full flex flex-col">
                  <div className="px-4 py-2 bg-slate-750 border-b border-slate-700 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-slate-300">
                          Systems {selectedStateId ? 'in selected area' : '(All US)'}
                        </h3>
                        <p className="text-xs text-slate-500">{systems.length} systems</p>
                      </div>
                      {(selectedStateId || selectedCountyId) && (
                        <button
                          onClick={() => setShowScanner(true)}
                          className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-medium flex items-center gap-1"
                          title={`Scan ${selectedCounty?.name || selectedState?.name || 'area'}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Scan
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {systems.slice(0, 50).map((system) => (
                      <button
                        key={system.id}
                        onClick={() => selectSystem(system.id)}
                        className={`w-full text-left px-4 py-2 text-sm border-b border-slate-700 hover:bg-slate-700 transition-colors ${
                          selectedSystemId === system.id ? 'bg-blue-900/30' : ''
                        }`}
                      >
                        <div className="font-medium text-slate-200 truncate">{system.name}</div>
                        <div className="text-xs text-slate-500">
                          {system.stateAbbrev}
                          {system.countyName && ` - ${system.countyName}`}
                        </div>
                      </button>
                    ))}
                    {systems.length > 50 && (
                      <div className="px-4 py-2 text-xs text-slate-500 text-center">
                        +{systems.length - 50} more systems
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>
            )}

            {/* System details */}
            <div className="flex-1 overflow-y-auto">
              <SystemDetails />
            </div>
          </div>
        </ResizablePanel>
      </div>

      {/* Scanner Modal */}
      {showScanner && (
        <ControlChannelScanner
          countyId={selectedCountyId}
          stateId={!selectedCountyId ? selectedStateId : null}
          onClose={() => setShowScanner(false)}
          onSelectSystem={(sysId) => {
            selectSystem(sysId);
            setShowScanner(false);
          }}
        />
      )}
    </div>
  );
}
