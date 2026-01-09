import { useRadioReferenceStore } from '../../store/radioreference';

export function StateSelector() {
  const {
    states,
    selectedStateId,
    selectState,
    counties,
    selectedCountyId,
    selectCounty,
    typeFilter,
    setTypeFilter,
    selectedSystems,
    isLoading,
  } = useRadioReferenceStore();

  return (
    <div className="p-3 space-y-4">
      {/* Type filter */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">System Type</label>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="P25">P25 (All)</option>
          <option value="P25 Phase II">P25 Phase II</option>
          <option value="DMR">DMR</option>
          <option value="NXDN">NXDN</option>
        </select>
      </div>

      {/* State selector */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">State</label>
        <select
          value={selectedStateId || ''}
          onChange={(e) => selectState(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All States</option>
          {states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name} ({state.abbreviation})
            </option>
          ))}
        </select>
      </div>

      {/* County selector */}
      {selectedStateId && counties.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">County</label>
          <select
            value={selectedCountyId || ''}
            onChange={(e) => selectCounty(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Counties</option>
            {counties.map((county) => (
              <option key={county.id} value={county.id}>
                {county.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Selected systems */}
      {selectedSystems.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
            My Systems ({selectedSystems.length})
          </label>
          <div className="space-y-1">
            {selectedSystems.map((system) => (
              <div
                key={system.id}
                className="px-2 py-1.5 bg-blue-900/30 border border-blue-700/50 rounded text-xs"
              >
                <div className="text-slate-200 font-medium truncate">{system.name}</div>
                <div className="text-slate-400">
                  {system.stateAbbrev} | {system.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="text-center text-sm text-slate-400 py-2">Loading...</div>
      )}
    </div>
  );
}
