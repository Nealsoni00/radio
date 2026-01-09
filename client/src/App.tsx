import { useWebSocket } from './hooks/useWebSocket';
import { Header } from './components/layout/Header';
import { CallList } from './components/calls/CallList';
import { CallDetails } from './components/calls/CallDetails';
import { TalkgroupFilter } from './components/talkgroups/TalkgroupFilter';
import { LiveAudioPlayer } from './components/audio/LiveAudioPlayer';
import { SystemStatus } from './components/status/SystemStatus';
import { useCallsStore, useAudioStore } from './store';
import { useEffect } from 'react';

function App() {
  const { enableAudio } = useWebSocket();
  const { selectedCall } = useCallsStore();
  const { isLiveEnabled } = useAudioStore();

  // Sync audio streaming with server
  useEffect(() => {
    enableAudio(isLiveEnabled);
  }, [isLiveEnabled, enableAudio]);

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <Header />

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

      <SystemStatus />

      {/* Live audio player (invisible, handles audio in background) */}
      <LiveAudioPlayer />
    </div>
  );
}

export default App;
