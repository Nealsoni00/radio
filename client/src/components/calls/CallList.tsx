import { useEffect, useRef, useState } from 'react';
import { useCallsStore } from '../../store';
import { useSystemStore } from '../../store/system';
import { CallItem } from './CallItem';

export function CallList() {
  const { calls, activeCalls, selectedCall, selectCall, isLoading } = useCallsStore();
  const { activeSystem } = useSystemStore();
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

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
        {!activeSystem && (
          <div className="p-8 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
            <h3 className="text-white font-medium mb-2">Select a System</h3>
            <p className="text-slate-400 text-sm">
              Go to <span className="text-blue-400 font-medium">Browse Systems</span> to find and switch to a P25 radio system in your area.
            </p>
          </div>
        )}
        {activeSystem && allCalls.length === 0 && !isLoading && (
          <div className="p-8 text-center text-slate-500">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            Listening for radio traffic on {activeSystem.shortName}...
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
