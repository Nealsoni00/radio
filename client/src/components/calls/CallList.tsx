import { useEffect, useRef, useState } from 'react';
import { useCallsStore } from '../../store';
import { CallItem } from './CallItem';

export function CallList() {
  const { calls, activeCalls, selectedCall, selectCall, fetchCalls, isLoading } = useCallsStore();
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    fetchCalls({ limit: 100 });
  }, [fetchCalls]);

  // Auto-scroll to new calls
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [calls.length, autoScroll]);

  const handleScroll = () => {
    if (!listRef.current) return;
    // Disable auto-scroll if user scrolls down
    setAutoScroll(listRef.current.scrollTop < 50);
  };

  // Merge active calls with historical calls, avoiding duplicates
  const allCalls = [...activeCalls];
  const activeIds = new Set(activeCalls.map((c) => c.id));
  for (const call of calls) {
    if (!activeIds.has(call.id)) {
      allCalls.push(call);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <h2 className="font-semibold text-white">Recent Calls</h2>
        <div className="flex items-center gap-2">
          {activeCalls.length > 0 && (
            <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
              {activeCalls.length} Active
            </span>
          )}
          <button
            onClick={() => {
              setAutoScroll(true);
              if (listRef.current) listRef.current.scrollTop = 0;
            }}
            className={classNames(
              'text-xs px-2 py-1 rounded',
              autoScroll
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Call list */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {allCalls.length === 0 && !isLoading && (
          <div className="p-8 text-center text-slate-500">
            No calls yet. Waiting for radio traffic...
          </div>
        )}
        {allCalls.map((call) => (
          <CallItem
            key={call.id}
            call={call}
            isSelected={selectedCall?.id === call.id}
            onClick={() => selectCall(call)}
          />
        ))}
        {isLoading && (
          <div className="p-4 text-center text-slate-500">Loading...</div>
        )}
      </div>
    </div>
  );
}

function classNames(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
