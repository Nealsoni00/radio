import { useState, useEffect, useCallback } from 'react';
import { useRadioReferenceStore } from '../../store/radioreference';

export function SearchBar() {
  const { searchQuery, search, clearSearch, isSearching, searchResults, selectSystem } = useRadioReferenceStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(localQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, search]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    clearSearch();
  }, [clearSearch]);

  return (
    <div className="relative">
      <input
        type="text"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        placeholder="Search systems, talkgroups..."
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Search results dropdown */}
      {searchResults && localQuery.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg max-h-96 overflow-y-auto z-50">
          {isSearching ? (
            <div className="p-3 text-sm text-slate-400">Searching...</div>
          ) : searchResults.systems.length === 0 && searchResults.talkgroups.length === 0 ? (
            <div className="p-3 text-sm text-slate-400">No results found</div>
          ) : (
            <>
              {searchResults.systems.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase bg-slate-800">
                    Systems ({searchResults.systems.length})
                  </div>
                  {searchResults.systems.map((system) => (
                    <button
                      key={system.id}
                      onClick={() => {
                        selectSystem(system.id);
                        handleClear();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-600 border-b border-slate-600 last:border-b-0"
                    >
                      <div className="text-sm text-slate-100 font-medium">{system.name}</div>
                      <div className="text-xs text-slate-400">
                        {system.stateAbbrev} {system.countyName && `- ${system.countyName}`} | {system.type}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.talkgroups.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase bg-slate-800">
                    Talkgroups ({searchResults.talkgroups.length})
                  </div>
                  {searchResults.talkgroups.slice(0, 10).map((tg, idx) => (
                    <button
                      key={`${tg.systemId}-${tg.talkgroupId}-${idx}`}
                      onClick={() => {
                        selectSystem(tg.systemId);
                        handleClear();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-600 border-b border-slate-600 last:border-b-0"
                    >
                      <div className="text-sm text-slate-100 font-medium">
                        {tg.alphaTag || `TG ${tg.talkgroupId}`}
                      </div>
                      <div className="text-xs text-slate-400">
                        {tg.description && `${tg.description} | `}
                        TG {tg.talkgroupId}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
