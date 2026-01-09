import { useRadioReferenceStore } from '../../store/radioreference';
import type { RRSystem } from '../../types';

function SystemCard({ system, isSelected, onClick }: { system: RRSystem; isSelected: boolean; onClick: () => void }) {
  const isP25 = system.type.includes('P25');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border-b border-slate-700 hover:bg-slate-800 transition-colors ${
        isSelected ? 'bg-blue-900/30 border-l-4 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-slate-100 truncate">{system.name}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span>{system.stateAbbrev}</span>
            {system.countyName && (
              <>
                <span className="text-slate-600">|</span>
                <span>{system.countyName}</span>
              </>
            )}
            {system.city && (
              <>
                <span className="text-slate-600">|</span>
                <span>{system.city}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 ml-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              isP25
                ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {system.type}
          </span>
          {system.talkgroupCount !== undefined && system.talkgroupCount > 0 && (
            <span className="text-xs text-slate-500">{system.talkgroupCount} TGs</span>
          )}
        </div>
      </div>
      {system.wacn && (
        <div className="mt-2 flex gap-3 text-xs text-slate-500">
          {system.wacn && <span>WACN: {system.wacn}</span>}
          {system.systemId && <span>SysID: {system.systemId}</span>}
          {system.nac && <span>NAC: {system.nac}</span>}
        </div>
      )}
    </button>
  );
}

export function SystemList() {
  const {
    systems,
    systemsTotal,
    selectedSystemId,
    selectSystem,
    loadMoreSystems,
    isLoading,
    selectedStateId,
  } = useRadioReferenceStore();

  if (!selectedStateId && systems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-lg font-medium">Select a State</p>
          <p className="text-sm mt-1">Choose a state from the sidebar to browse P25 systems</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-2 z-10">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {systems.length} of {systemsTotal.toLocaleString()} systems
          </span>
          {isLoading && (
            <span className="text-xs text-slate-500">Loading...</span>
          )}
        </div>
      </div>

      {/* System list */}
      <div className="flex-1 overflow-y-auto">
        {systems.map((system) => (
          <SystemCard
            key={system.id}
            system={system}
            isSelected={selectedSystemId === system.id}
            onClick={() => selectSystem(system.id)}
          />
        ))}

        {/* Load more button */}
        {systems.length < systemsTotal && (
          <div className="p-4 text-center">
            <button
              onClick={loadMoreSystems}
              disabled={isLoading}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 rounded-md disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : `Load More (${systemsTotal - systems.length} remaining)`}
            </button>
          </div>
        )}

        {/* Empty state */}
        {systems.length === 0 && !isLoading && (
          <div className="p-8 text-center text-slate-400">
            <p>No systems found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
