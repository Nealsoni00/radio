import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/layout/Header';
import { CallList } from './components/calls/CallList';
import { CallDetails } from './components/calls/CallDetails';
import { TalkgroupFilter } from './components/talkgroups/TalkgroupFilter';
import { LiveAudioPlayer } from './components/audio/LiveAudioPlayer';
import { SystemStatus } from './components/status/SystemStatus';
import { SystemBrowser } from './components/radioreference';
import { useCallsStore, useAudioStore } from './store';
import { useEffect, useState } from 'react';

type ViewMode = 'live' | 'browse';

function App() {
  const { enableAudio } = useWebSocket();
  const { selectedCall } = useCallsStore();
  const { isLiveEnabled } = useAudioStore();
  const [viewMode, setViewMode] = useState<ViewMode>('live');

  // Sync audio streaming with server
  useEffect(() => {
    enableAudio(isLiveEnabled);
  }, [isLiveEnabled, enableAudio]);

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header with view toggle */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-100">Radio Scanner</h1>
          {/* View toggle */}
          <div className="flex bg-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('live')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'live'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Live Scanner
            </button>
            <button
              onClick={() => setViewMode('browse')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'browse'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Browse Systems
            </button>
          </div>
        </div>
        <Header />
      </header>

      {viewMode === 'live' ? (
        // Live scanner view
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar - Talkgroup filter */}
          <aside className="w-72 border-r border-slate-700 flex flex-col bg-slate-900">
            <TalkgroupFilter />
          </aside>

          {/* Main content - Call list */}
          <main className="flex-1 flex flex-col bg-slate-900">
            <CallList />
          </main>

          {/* Right sidebar - Call details */}
          {selectedCall && (
            <aside className="w-80 border-l border-slate-700 flex flex-col bg-slate-900">
              <CallDetails />
            </aside>
          )}
        </div>
      ) : (
        // Browse systems view
        <SystemBrowser />
      )}

      <SystemStatus />

      {/* Live audio player (invisible, handles audio in background) */}
      <LiveAudioPlayer />
    </div>
  );
}

export default App;
