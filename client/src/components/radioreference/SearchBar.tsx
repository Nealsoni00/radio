import { useState, useEffect, useCallback } from 'react';
import { useRadioReferenceStore } from '../../store/radioreference';

export function SearchBar() {
  const { searchFilter, setSearchFilter, isLoading } = useRadioReferenceStore();
  const [localQuery, setLocalQuery] = useState(searchFilter);

  // Debounce search filter updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchFilter) {
        setSearchFilter(localQuery);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localQuery, searchFilter, setSearchFilter]);

  // Sync local query with store filter
  useEffect(() => {
    if (searchFilter !== localQuery && searchFilter === '') {
      setLocalQuery('');
    }
  }, [searchFilter]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    setSearchFilter('');
  }, [setSearchFilter]);

  return (
    <div className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Filter systems..."
          className="w-full pl-10 pr-8 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
      </div>

      {/* Loading indicator */}
      {isLoading && localQuery && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Search hint */}
      {localQuery && localQuery.length > 0 && localQuery.length < 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-xs text-slate-400 z-50">
          Type at least 2 characters to search
        </div>
      )}
    </div>
  );
}
